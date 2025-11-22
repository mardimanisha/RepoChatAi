import { projectId, publicAnonKey } from './supabase/info.tsx';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-7700f9fa`;

export interface Repository {
  id: string;
  userId: string;
  url: string;
  owner: string;
  name: string;
  status: 'processing' | 'ready' | 'error';
  error?: string;
  chunkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Chat {
  id: string;
  repoId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

async function fetchApi(
  endpoint: string, 
  options: RequestInit = {},
  token?: string
) {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['Authorization'] = `Bearer ${publicAnonKey}`;
  }
  
  console.log(`API Request: ${endpoint}`, { method: options.method || 'GET' });
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`API Error ${response.status}:`, data);
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }
    
    console.log(`API Response: ${endpoint}`, data);
    return data;
  } catch (error: any) {
    console.error(`API Fetch Error for ${endpoint}:`, error);
    throw new Error(error.message || 'Network request failed');
  }
}

// Auth API
export async function signup(email: string, password: string, name: string) {
  return fetchApi('/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

// Repository API
export async function createRepository(url: string, token: string): Promise<{ repository: Repository }> {
  return fetchApi('/repositories', {
    method: 'POST',
    body: JSON.stringify({ url }),
  }, token);
}

export async function getRepositories(token: string): Promise<{ repositories: Repository[] }> {
  return fetchApi('/repositories', {
    method: 'GET',
  }, token);
}

export async function getRepository(repoId: string, token: string): Promise<{ repository: Repository }> {
  return fetchApi(`/repositories/${encodeURIComponent(repoId)}`, {
    method: 'GET',
  }, token);
}

// Chat API
export async function createChat(repoId: string, title: string, token: string): Promise<{ chat: Chat }> {
  return fetchApi('/chats', {
    method: 'POST',
    body: JSON.stringify({ repoId, title }),
  }, token);
}

export async function getChats(repoId: string, token: string): Promise<{ chats: Chat[] }> {
  return fetchApi(`/chats/${encodeURIComponent(repoId)}`, {
    method: 'GET',
  }, token);
}

// Message API
export async function sendMessage(
  chatId: string, 
  content: string, 
  token: string
): Promise<{ userMessage: Message; assistantMessage: Message }> {
  return fetchApi('/messages', {
    method: 'POST',
    body: JSON.stringify({ chatId, content }),
  }, token);
}

export async function getMessages(chatId: string, token: string): Promise<{ messages: Message[] }> {
  return fetchApi(`/messages/${chatId}`, {
    method: 'GET',
  }, token);
}