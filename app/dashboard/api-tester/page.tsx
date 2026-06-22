'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Activity, Play } from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import { notify } from '@/lib/notify'

export default function ApiTesterPage() {
  const [method, setMethod] = useState('GET')
  const [endpoint, setEndpoint] = useState('/api/students')
  const [body, setBody] = useState('{}')
  const [response, setResponse] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleTest = async () => {
    setIsLoading(true)
    setResponse(null)
    try {
      const options: RequestInit = {
        method,
      }
      
      if (['POST', 'PATCH', 'PUT'].includes(method)) {
        options.body = body
      }

      const res = await fetchApi<any>(endpoint, options)
      setResponse(res)
      notify.success('API request successful')
    } catch (error: any) {
      setResponse({ error: error.message })
      notify.error('API request failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">API Sandbox</h1>
        <p className="text-sm text-gray-500">Test backend routes authenticated as your current user.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5"/> Request Settings</CardTitle>
            <CardDescription>Configure the API call to test.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="w-1/3">
                <Select onValueChange={setMethod} value={method}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-2/3">
                <Input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="/api/endpoint" />
              </div>
            </div>

            {['POST', 'PATCH', 'PUT'].includes(method) && (
              <div className="space-y-2">
                <label className="text-sm font-medium">JSON Body</label>
                <Textarea 
                  value={body} 
                  onChange={e => setBody(e.target.value)} 
                  rows={8} 
                  className="font-mono text-sm"
                />
              </div>
            )}

            <Button onClick={handleTest} disabled={isLoading} className="w-full gap-2">
              <Play className="w-4 h-4" />
              {isLoading ? 'Executing...' : 'Send Request'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Response Payload</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto h-[400px] text-xs font-mono">
              {response ? JSON.stringify(response, null, 2) : '// Response will appear here'}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
