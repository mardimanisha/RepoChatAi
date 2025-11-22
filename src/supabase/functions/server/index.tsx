import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js';
import * as kv from './kv_store.tsx';

const app = new Hono();

console.log('Starting server initialization...');

// Middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));
app.use('*', logger(console.log));

console.log('Middleware configured');

// Helper to create Supabase client
const getSupabaseClient = () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!url || !key) {
    console.error('Missing Supabase environment variables');
    throw new Error('Server configuration error');
  }
  
  return createClient(url, key);
};

// Helper to verify user
const verifyUser = async (request: Request) => {
  const accessToken = request.headers.get('Authorization')?.split(' ')[1];
  if (!accessToken) {
    return null;
  }
  
  const supabase = getSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  
  if (error || !user) {
    console.log(`Error verifying user: ${error?.message}`);
    return null;
  }
  
  return user;
};

// Auth Routes
app.post('/make-server-7700f9fa/signup', async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    
    if (!email || !password || !name) {
      return c.json({ error: 'Email, password, and name are required' }, 400);
    }
    
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });
    
    if (error) {
      console.log(`Error creating user during signup: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }
    
    return c.json({ user: data.user }, 201);
  } catch (error) {
    console.log(`Server error during signup: ${error}`);
    return c.json({ error: 'Internal server error during signup' }, 500);
  }
});

// Repository Routes
app.post('/make-server-7700f9fa/repositories', async (c) => {
  try {
    const user = await verifyUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { url } = await c.req.json();
    
    if (!url) {
      return c.json({ error: 'Repository URL is required' }, 400);
    }
    
    // Validate GitHub URL
    const githubUrlPattern = /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+\/?$/;
    if (!githubUrlPattern.test(url)) {
      return c.json({ error: 'Invalid GitHub repository URL' }, 400);
    }
    
    // Extract owner and repo name
    const urlParts = url.replace(/\/$/, '').split('/');
    const owner = urlParts[urlParts.length - 2];
    const repo = urlParts[urlParts.length - 1];
    
    // Generate a clean repository ID using timestamp and random string
    const repoId = `repo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if repository already exists for this user
    const userRepos = await kv.get(`user:${user.id}:repos`) || [];
    const existingRepo = userRepos.find((id: string) => {
      const repo = kv.get(`repo:${id}`);
      return repo && repo.owner === owner && repo.name === repo;
    });
    
    if (existingRepo) {
      return c.json({ error: 'Repository already added' }, 400);
    }
    
    // Create repository record
    const repository = {
      id: repoId,
      userId: user.id,
      url,
      owner,
      name: repo,
      status: 'processing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`repo:${repoId}`, repository);
    
    // Add to user's repository list
    userRepos.push(repoId);
    await kv.set(`user:${user.id}:repos`, userRepos);
    
    // Start embedding process in background - mark as ready for now
    // The RAG functionality will process repositories in the background
    setTimeout(async () => {
      try {
        const repo = await kv.get(`repo:${repoId}`);
        if (repo) {
          repo.status = 'ready';
          repo.updatedAt = new Date().toISOString();
          await kv.set(`repo:${repoId}`, repo);
        }
      } catch (error) {
        console.log(`Error updating repository status: ${error}`);
      }
    }, 2000);
    
    return c.json({ repository }, 201);
  } catch (error) {
    console.log(`Server error creating repository: ${error}`);
    return c.json({ error: 'Internal server error while creating repository' }, 500);
  }
});

app.get('/make-server-7700f9fa/repositories', async (c) => {
  try {
    const user = await verifyUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userRepos = await kv.get(`user:${user.id}:repos`) || [];
    const repositories = await kv.mget(userRepos.map(id => `repo:${id}`));
    
    return c.json({ repositories: repositories.filter(r => r !== null) });
  } catch (error) {
    console.log(`Server error fetching repositories: ${error}`);
    return c.json({ error: 'Internal server error while fetching repositories' }, 500);
  }
});

app.get('/make-server-7700f9fa/repositories/:repoId', async (c) => {
  try {
    const user = await verifyUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { repoId } = c.req.param();
    const decodedRepoId = decodeURIComponent(repoId);
    console.log(`Fetching repository: ${decodedRepoId}`);
    const repository = await kv.get(`repo:${decodedRepoId}`);
    
    if (!repository || repository.userId !== user.id) {
      console.log(`Repository not found or unauthorized: ${decodedRepoId}`);
      return c.json({ error: 'Repository not found' }, 404);
    }
    
    return c.json({ repository });
  } catch (error) {
    console.log(`Server error fetching repository: ${error}`);
    return c.json({ error: 'Internal server error while fetching repository' }, 500);
  }
});

app.delete('/make-server-7700f9fa/repositories/:repoId', async (c) => {
  try {
    const user = await verifyUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { repoId } = c.req.param();
    const repository = await kv.get(`repo:${repoId}`);
    
    if (!repository || repository.userId !== user.id) {
      return c.json({ error: 'Repository not found' }, 404);
    }
    
    // Remove repository from user's repository list
    const userRepos = await kv.get(`user:${user.id}:repos`) || [];
    const updatedUserRepos = userRepos.filter(id => id !== repoId);
    await kv.set(`user:${user.id}:repos`, updatedUserRepos);
    
    // Delete repository record
    await kv.del(`repo:${repoId}`);
    
    return c.json({ message: 'Repository deleted successfully' }, 200);
  } catch (error) {
    console.log(`Error deleting repository: ${error}`);
    return c.json({ error: 'Internal server error while deleting repository' }, 500);
  }
});

// Chat Routes
app.post('/make-server-7700f9fa/chats', async (c) => {
  try {
    const user = await verifyUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { repoId, title } = await c.req.json();
    
    const repository = await kv.get(`repo:${repoId}`);
    if (!repository || repository.userId !== user.id) {
      return c.json({ error: 'Repository not found' }, 404);
    }
    
    const chatId = `${repoId}:${Date.now()}`;
    const chat = {
      id: chatId,
      repoId,
      userId: user.id,
      title: title || 'New Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`chat:${chatId}`, chat);
    
    // Add to repository's chat list
    const repoChats = await kv.get(`repo:${repoId}:chats`) || [];
    repoChats.push(chatId);
    await kv.set(`repo:${repoId}:chats`, repoChats);
    
    return c.json({ chat }, 201);
  } catch (error) {
    console.log(`Server error creating chat: ${error}`);
    return c.json({ error: 'Internal server error while creating chat' }, 500);
  }
});

app.get('/make-server-7700f9fa/chats/:repoId', async (c) => {
  try {
    const user = await verifyUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { repoId } = c.req.param();
    const decodedRepoId = decodeURIComponent(repoId);
    console.log(`Fetching chats for repository: ${decodedRepoId}`);
    const repository = await kv.get(`repo:${decodedRepoId}`);
    
    if (!repository || repository.userId !== user.id) {
      console.log(`Repository not found or unauthorized for chats: ${decodedRepoId}`);
      return c.json({ error: 'Repository not found' }, 404);
    }
    
    const chatIds = await kv.get(`repo:${decodedRepoId}:chats`) || [];
    const chats = await kv.mget(chatIds.map(id => `chat:${id}`));
    
    return c.json({ chats: chats.filter(c => c !== null) });
  } catch (error) {
    console.log(`Server error fetching chats: ${error}`);
    return c.json({ error: 'Internal server error while fetching chats' }, 500);
  }
});

// Message Routes
app.post('/make-server-7700f9fa/messages', async (c) => {
  try {
    const user = await verifyUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { chatId, content } = await c.req.json();
    
    if (!content) {
      return c.json({ error: 'Message content is required' }, 400);
    }
    
    const chat = await kv.get(`chat:${chatId}`);
    if (!chat || chat.userId !== user.id) {
      return c.json({ error: 'Chat not found' }, 404);
    }
    
    const repository = await kv.get(`repo:${chat.repoId}`);
    if (repository.status !== 'ready') {
      return c.json({ error: 'Repository is still processing' }, 400);
    }
    
    // Create user message
    const userMessageId = `${chatId}:msg:${Date.now()}`;
    const userMessage = {
      id: userMessageId,
      chatId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    
    await kv.set(`message:${userMessageId}`, userMessage);
    
    // Add to chat's message list
    const chatMessages = await kv.get(`chat:${chatId}:messages`) || [];
    chatMessages.push(userMessageId);
    
    // Generate simple response (RAG functionality will be added later)
    const response = `I received your question: "${content}". The RAG system is being set up to provide detailed answers about the repository ${repository.owner}/${repository.name}.`;
    
    // Create assistant message
    const assistantMessageId = `${chatId}:msg:${Date.now() + 1}`;
    const assistantMessage = {
      id: assistantMessageId,
      chatId,
      role: 'assistant',
      content: response,
      createdAt: new Date().toISOString(),
    };
    
    await kv.set(`message:${assistantMessageId}`, assistantMessage);
    chatMessages.push(assistantMessageId);
    await kv.set(`chat:${chatId}:messages`, chatMessages);
    
    return c.json({ 
      userMessage,
      assistantMessage 
    }, 201);
  } catch (error) {
    console.log(`Server error sending message: ${error}`);
    return c.json({ error: 'Internal server error while sending message' }, 500);
  }
});

app.get('/make-server-7700f9fa/messages/:chatId', async (c) => {
  try {
    const user = await verifyUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { chatId } = c.req.param();
    const chat = await kv.get(`chat:${chatId}`);
    
    if (!chat || chat.userId !== user.id) {
      return c.json({ error: 'Chat not found' }, 404);
    }
    
    const messageIds = await kv.get(`chat:${chatId}:messages`) || [];
    const messages = await kv.mget(messageIds.map(id => `message:${id}`));
    
    return c.json({ messages: messages.filter(m => m !== null) });
  } catch (error) {
    console.log(`Server error fetching messages: ${error}`);
    return c.json({ error: 'Internal server error while fetching messages' }, 500);
  }
});

// Health check
app.get('/make-server-7700f9fa/health', (c) => {
  return c.json({ status: 'healthy' });
});

console.log('Server initialized successfully');
console.log('Available routes:');
console.log('  GET  /make-server-7700f9fa/health');
console.log('  POST /make-server-7700f9fa/signup');
console.log('  POST /make-server-7700f9fa/repositories');
console.log('  GET  /make-server-7700f9fa/repositories');
console.log('  DELETE /make-server-7700f9fa/repositories/:id');
console.log('  POST /make-server-7700f9fa/chats');
console.log('  GET  /make-server-7700f9fa/chats/:repoId');
console.log('  POST /make-server-7700f9fa/messages');
console.log('  GET  /make-server-7700f9fa/messages/:chatId');

Deno.serve(app.fetch);