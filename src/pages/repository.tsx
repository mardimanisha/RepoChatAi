import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion } from 'motion/react';
import { ArrowLeft, Loader2, Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Sidebar } from '../components/sidebar';
import { ChatMessage } from '../components/chat-message';
import { ChatInput } from '../components/chat-input';
import { createClient } from '../utils/supabase/client';
import { 
  getRepository, 
  getChats, 
  createChat, 
  getMessages, 
  sendMessage 
} from '../utils/api';
import type { Repository, Chat, Message } from '../utils/api';
import { toast } from 'sonner@2.0.3';

export default function RepositoryPage() {
  const navigate = useNavigate();
  const { repoId } = useParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [user, setUser] = useState<any>(null);
  const [repository, setRepository] = useState<Repository | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  
  useEffect(() => {
    checkAuth();
  }, []);
  
  useEffect(() => {
    if (user && repoId) {
      loadRepository();
      loadChats();
    }
  }, [user, repoId]);
  
  useEffect(() => {
    if (selectedChat) {
      loadMessages();
    }
  }, [selectedChat]);
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const checkAuth = async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate('/auth');
        return;
      }
      
      setUser({
        name: session.user.user_metadata?.name || 'User',
        email: session.user.email,
      });
    } catch (error) {
      console.error('Auth check error:', error);
      navigate('/auth');
    }
  };
  
  const loadRepository = async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session || !repoId) return;
      
      const data = await getRepository(decodeURIComponent(repoId), session.access_token);
      setRepository(data.repository);
    } catch (error: any) {
      toast.error('Failed to load repository');
      console.error('Load repository error:', error);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };
  
  const loadChats = async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session || !repoId) return;
      
      const data = await getChats(decodeURIComponent(repoId), session.access_token);
      setChats(data.chats);
    } catch (error: any) {
      console.error('Load chats error:', error);
    }
  };
  
  const loadMessages = async () => {
    if (!selectedChat) return;
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;
      
      const data = await getMessages(selectedChat.id, session.access_token);
      setMessages(data.messages);
    } catch (error: any) {
      console.error('Load messages error:', error);
    }
  };
  
  const handleNewChat = async () => {
    if (!repoId) return;
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;
      
      const data = await createChat(
        decodeURIComponent(repoId), 
        'New Chat', 
        session.access_token
      );
      
      setChats([data.chat, ...chats]);
      setSelectedChat(data.chat);
      setMessages([]);
      toast.success('New chat created');
    } catch (error: any) {
      toast.error('Failed to create chat');
      console.error('Create chat error:', error);
    }
  };
  
  const handleSendMessage = async (content: string) => {
    if (!selectedChat || repository?.status !== 'ready') {
      toast.error('Repository is not ready yet');
      return;
    }
    
    setSending(true);
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;
      
      const data = await sendMessage(selectedChat.id, content, session.access_token);
      
      setMessages([...messages, data.userMessage, data.assistantMessage]);
      
      // Update chat title if it's the first message
      if (messages.length === 0) {
        const updatedChat = { ...selectedChat, title: content.substring(0, 50) };
        setSelectedChat(updatedChat);
        setChats(chats.map(c => c.id === selectedChat.id ? updatedChat : c));
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to send message');
      console.error('Send message error:', error);
    } finally {
      setSending(false);
    }
  };
  
  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    navigate('/');
  };
  
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="flex h-screen bg-background">
      <Sidebar 
        user={user} 
        chats={chats}
        selectedChatId={selectedChat?.id}
        onNewChat={handleNewChat}
        onChatSelect={(chatId) => {
          const chat = chats.find(c => c.id === chatId);
          if (chat) setSelectedChat(chat);
        }}
        onLogout={handleLogout}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border p-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="size-4 mr-2" />
            Back
          </Button>
          
          {repository && (
            <div className="flex-1">
              <h2 className="truncate">
                {repository.owner}/{repository.name}
              </h2>
              <p className="text-xs text-muted-foreground">
                Status: {repository.status}
              </p>
            </div>
          )}
        </div>
        
        {!selectedChat ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-4 max-w-md"
            >
              <h2 className="text-2xl">Start a New Chat</h2>
              <p className="text-muted-foreground">
                Create a new chat to start asking questions about this repository
              </p>
              <Button onClick={handleNewChat} size="lg">
                <Plus className="mr-2 size-4" />
                New Chat
              </Button>
            </motion.div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto">
                {messages.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-12"
                  >
                    <p className="text-muted-foreground">
                      Start the conversation by asking a question about the repository
                    </p>
                  </motion.div>
                ) : (
                  messages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
            
            <div className="border-t border-border p-4">
              <div className="max-w-3xl mx-auto">
                <ChatInput
                  onSend={handleSendMessage}
                  disabled={sending || repository?.status !== 'ready'}
                  placeholder={
                    repository?.status === 'processing'
                      ? 'Repository is processing...'
                      : repository?.status === 'error'
                      ? 'Repository processing failed'
                      : 'Ask a question about this repository...'
                  }
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
