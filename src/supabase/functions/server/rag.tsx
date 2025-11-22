import { HuggingFaceInferenceEmbeddings } from 'npm:@langchain/community/embeddings/hf';
import { RecursiveCharacterTextSplitter } from 'npm:@langchain/textsplitters';
import Anthropic from 'npm:@anthropic-ai/sdk';
import * as kv from './kv_store.tsx';

// Initialize Hugging Face embeddings
const getEmbeddings = () => {
  const hfToken = Deno.env.get('HF_TOKEN');
  if (!hfToken) {
    throw new Error('HF_TOKEN environment variable is required for embeddings');
  }
  
  return new HuggingFaceInferenceEmbeddings({
    apiKey: hfToken,
    model: 'sentence-transformers/all-MiniLM-L6-v2',
  });
};

// Initialize Anthropic client
const getAnthropicClient = () => {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }
  
  return new Anthropic({ apiKey });
};

// Fetch repository contents from GitHub
async function fetchGitHubRepo(owner: string, repo: string): Promise<string> {
  try {
    // Fetch README
    const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`;
    let readme = '';
    
    try {
      const readmeResponse = await fetch(readmeUrl);
      if (readmeResponse.ok) {
        readme = await readmeResponse.text();
      }
    } catch (e) {
      console.log(`Could not fetch README for ${owner}/${repo}: ${e}`);
    }
    
    // Fetch repository structure using GitHub API
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const repoResponse = await fetch(apiUrl);
    
    if (!repoResponse.ok) {
      throw new Error(`Failed to fetch repository info: ${repoResponse.statusText}`);
    }
    
    const repoData = await repoResponse.json();
    
    // Fetch tree to get file structure
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${repoData.default_branch}?recursive=1`;
    const treeResponse = await fetch(treeUrl);
    
    if (!treeResponse.ok) {
      throw new Error(`Failed to fetch repository tree: ${treeResponse.statusText}`);
    }
    
    const treeData = await treeResponse.json();
    const files = treeData.tree.filter((item: any) => 
      item.type === 'blob' && 
      (item.path.endsWith('.md') || 
       item.path.endsWith('.txt') ||
       item.path.endsWith('.js') ||
       item.path.endsWith('.ts') ||
       item.path.endsWith('.tsx') ||
       item.path.endsWith('.jsx') ||
       item.path.endsWith('.py') ||
       item.path.endsWith('.go') ||
       item.path.endsWith('.java'))
    ).slice(0, 50); // Limit to 50 files for demo
    
    let content = `Repository: ${owner}/${repo}\n`;
    content += `Description: ${repoData.description || 'No description'}\n`;
    content += `Language: ${repoData.language || 'Unknown'}\n\n`;
    
    if (readme) {
      content += `README:\n${readme}\n\n`;
    }
    
    content += `File Structure:\n`;
    for (const file of files) {
      content += `- ${file.path}\n`;
    }
    
    return content;
  } catch (error) {
    console.log(`Error fetching GitHub repository ${owner}/${repo}: ${error}`);
    throw error;
  }
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

// Embed repository contents
export async function embedRepository(
  repoId: string, 
  url: string, 
  owner: string, 
  repo: string
): Promise<void> {
  try {
    console.log(`Starting embedding process for repository ${repoId}`);
    
    // Fetch repository contents
    const content = await fetchGitHubRepo(owner, repo);
    
    // Split text into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const chunks = await textSplitter.createDocuments([content]);
    console.log(`Split repository ${repoId} into ${chunks.length} chunks`);
    
    // Generate embeddings
    const embeddings = getEmbeddings();
    const chunkTexts = chunks.map(chunk => chunk.pageContent);
    const vectors = await embeddings.embedDocuments(chunkTexts);
    
    console.log(`Generated ${vectors.length} embeddings for repository ${repoId}`);
    
    // Store embeddings in KV store
    const embeddingData = chunks.map((chunk, i) => ({
      text: chunk.pageContent,
      embedding: vectors[i],
    }));
    
    await kv.set(`embeddings:${repoId}`, embeddingData);
    
    // Update repository status
    const repository = await kv.get(`repo:${repoId}`);
    repository.status = 'ready';
    repository.updatedAt = new Date().toISOString();
    repository.chunkCount = chunks.length;
    await kv.set(`repo:${repoId}`, repository);
    
    console.log(`Successfully embedded repository ${repoId}`);
  } catch (error) {
    console.log(`Error in embedRepository for ${repoId}: ${error}`);
    
    // Update repository status to error
    const repository = await kv.get(`repo:${repoId}`);
    if (repository) {
      repository.status = 'error';
      repository.error = error.message;
      repository.updatedAt = new Date().toISOString();
      await kv.set(`repo:${repoId}`, repository);
    }
    
    throw error;
  }
}

// Query repository with user question
export async function queryRepository(
  repoId: string, 
  question: string,
  messageIds: string[]
): Promise<string> {
  try {
    console.log(`Querying repository ${repoId} with question: ${question}`);
    
    // Get embeddings for the question
    const embeddings = getEmbeddings();
    const questionVector = await embeddings.embedQuery(question);
    
    // Retrieve stored embeddings
    const embeddingData = await kv.get(`embeddings:${repoId}`);
    
    if (!embeddingData || embeddingData.length === 0) {
      throw new Error('Repository embeddings not found');
    }
    
    // Find most similar chunks
    const similarities = embeddingData.map((item: any) => ({
      text: item.text,
      similarity: cosineSimilarity(questionVector, item.embedding),
    }));
    
    // Sort by similarity and get top 3
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topChunks = similarities.slice(0, 3);
    
    console.log(`Found ${topChunks.length} relevant chunks for question`);
    
    // Retrieve chat history (last 10 messages)
    const recentMessageIds = messageIds.slice(-10);
    const recentMessages = await kv.mget(recentMessageIds.map(id => `message:${id}`));
    
    // Build context from top chunks
    const context = topChunks.map(chunk => chunk.text).join('\n\n---\n\n');
    
    // Build chat history
    const chatHistory = recentMessages
      .filter(m => m !== null)
      .map((m: any) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
      .join('\n');
    
    // Query Anthropic with context
    const anthropic = getAnthropicClient();
    
    const systemPrompt = `You are a helpful AI assistant that answers questions about a GitHub repository. 
Use the following context from the repository to answer the user's question. 
If the context doesn't contain relevant information, say so.

Repository Context:
${context}`;

    const userPrompt = chatHistory 
      ? `${chatHistory}\nHuman: ${question}`
      : question;
    
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        }
      ],
      system: systemPrompt,
    });
    
    const response = message.content[0].type === 'text' 
      ? message.content[0].text 
      : 'Unable to generate response';
    
    console.log(`Generated response for question in repository ${repoId}`);
    
    return response;
  } catch (error) {
    console.log(`Error querying repository ${repoId}: ${error}`);
    throw error;
  }
}