import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { createClient } from '../utils/supabase/client';
import { projectId, publicAnonKey } from '../utils/supabase/info.tsx';

export default function TestPage() {
  const [tests, setTests] = useState({
    supabaseInit: { status: 'pending', message: '' },
    serverHealth: { status: 'pending', message: '' },
    authConnection: { status: 'pending', message: '' },
  });
  
  const runTests = async () => {
    // Reset all tests to pending
    setTests({
      supabaseInit: { status: 'pending', message: '' },
      serverHealth: { status: 'pending', message: '' },
      authConnection: { status: 'pending', message: '' },
    });
    
    // Test 1: Supabase Client Initialization
    try {
      const supabase = createClient();
      setTests(prev => ({
        ...prev,
        supabaseInit: { 
          status: 'success', 
          message: `Client initialized successfully. URL: https://${projectId}.supabase.co` 
        }
      }));
      
      // Test 3: Auth Connection
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        setTests(prev => ({
          ...prev,
          authConnection: { 
            status: 'success', 
            message: 'Auth service is accessible' 
          }
        }));
      } catch (error: any) {
        setTests(prev => ({
          ...prev,
          authConnection: { 
            status: 'error', 
            message: `Auth error: ${error.message}` 
          }
        }));
      }
    } catch (error: any) {
      setTests(prev => ({
        ...prev,
        supabaseInit: { 
          status: 'error', 
          message: `Init failed: ${error.message}` 
        },
        authConnection: { 
          status: 'error', 
          message: 'Skipped due to init failure' 
        }
      }));
    }
    
    // Test 2: Server Health Check
    try {
      const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-7700f9fa`;
      console.log('Testing server at:', baseUrl);
      const response = await fetch(`${baseUrl}/health`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });
      
      console.log('Server response status:', response.status);
      
      if (!response.ok) {
        const text = await response.text();
        console.log('Server error response:', text);
        throw new Error(`Server responded with ${response.status}: ${text}`);
      }
      
      const data = await response.json();
      console.log('Server health data:', data);
      setTests(prev => ({
        ...prev,
        serverHealth: { 
          status: 'success', 
          message: `Server is healthy: ${JSON.stringify(data)}` 
        }
      }));
    } catch (error: any) {
      console.error('Server health check failed:', error);
      setTests(prev => ({
        ...prev,
        serverHealth: { 
          status: 'error', 
          message: `Server error: ${error.message}` 
        }
      }));
    }
  };
  
  useEffect(() => {
    runTests();
  }, []);
  
  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'pending') return <Loader2 className="size-5 animate-spin text-muted-foreground" />;
    if (status === 'success') return <CheckCircle className="size-5 text-green-500" />;
    return <XCircle className="size-5 text-red-500" />;
  };
  
  return (
    <div className="min-h-screen p-8 bg-background">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl mb-2">System Diagnostics</h1>
          <p className="text-muted-foreground">Testing connection to services</p>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Project ID:</span>
              <span className="font-mono">{projectId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Supabase URL:</span>
              <span className="font-mono text-xs">https://{projectId}.supabase.co</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Server URL:</span>
              <span className="font-mono text-xs">https://{projectId}.supabase.co/functions/v1/make-server-7700f9fa</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <StatusIcon status={tests.supabaseInit.status} />
              <div className="flex-1">
                <h3 className="font-medium mb-1">Supabase Client Initialization</h3>
                <p className="text-sm text-muted-foreground">{tests.supabaseInit.message}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <StatusIcon status={tests.serverHealth.status} />
              <div className="flex-1">
                <h3 className="font-medium mb-1">Server Health Check</h3>
                <p className="text-sm text-muted-foreground">{tests.serverHealth.message}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <StatusIcon status={tests.authConnection.status} />
              <div className="flex-1">
                <h3 className="font-medium mb-1">Auth Service Connection</h3>
                <p className="text-sm text-muted-foreground">{tests.authConnection.message}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Button onClick={runTests} className="w-full">
          Rerun Tests
        </Button>
        
        <div className="text-center">
          <Button variant="link" onClick={() => window.location.href = '/'}>
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}