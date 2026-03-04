import React, { useState, useRef, useEffect } from 'react';
import { Upload, File, Send, Loader2, Bot, User } from 'lucide-react';

function App() {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thoughtStatus, setThoughtStatus] = useState('');
  
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking, thoughtStatus]);

  const handleFileUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsUploading(true);
    setUploadSuccess(false);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        setUploadSuccess(true);
      } else {
        alert("File upload or parsing failed.");
      }
    } catch (error) {
      console.error("Upload error", error);
      alert("Error connecting to the server.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !uploadSuccess || isThinking) return;

    const userMessage = { role: "user", content: input };
    const history = [...messages];
    
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsThinking(true);
    setThoughtStatus("Connecting...");

    try {
      const response = await fetch("http://127.0.0.1:8000/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: userMessage.content,
          history: history,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        
        for (const part of parts) {
          if (part.startsWith("data: ")) {
            const dataStr = part.slice(6).trim();
            if (!dataStr) continue;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.type === "status") {
                setThoughtStatus(data.content);
              } else if (data.type === "answer") {
                setMessages(prev => [...prev, { role: "ai", content: data.content }]);
                setIsThinking(false);
                setThoughtStatus("");
              } else if (data.type === "error") {
                setMessages(prev => [...prev, { role: "ai", content: `Error: ${data.content}` }]);
                setIsThinking(false);
                setThoughtStatus("");
              }
            } catch (err) {
              console.error("Error parsing SSE data", err, dataStr);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error fetching query", error);
      setIsThinking(false);
      setMessages(prev => [...prev, { role: "ai", content: "Error connecting to the server." }]);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      <header className="bg-white border-b px-6 py-4 flex items-center shadow-sm z-10">
        <Bot className="w-8 h-8 text-blue-600 mr-3" />
        <h1 className="text-xl font-bold text-gray-800">Document Analyzer</h1>
      </header>
      
      <div className="flex-1 overflow-hidden flex flex-col max-w-4xl mx-auto w-full p-4">
        
        {/* Upload Zone */}
        <div className={`mb-4 p-6 border-2 border-dashed rounded-xl transition-colors ${uploadSuccess ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-white hover:border-blue-400'}`}>
          <div className="flex flex-col items-center justify-center text-center">
            {isUploading ? (
              <div className="flex flex-col items-center text-blue-600">
                <Loader2 className="w-10 h-10 animate-spin mb-2" />
                <p className="font-medium">Uploading and Analyzing Document...</p>
                <p className="text-sm text-gray-500 mt-1">This may take a minute or two.</p>
              </div>
            ) : uploadSuccess ? (
              <div className="flex flex-col items-center text-green-600">
                <File className="w-10 h-10 mb-2" />
                <p className="font-medium">Document Ready: {file?.name}</p>
                <p className="text-sm text-green-700 mt-1">You can now chat with the document.</p>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-gray-400 mb-2" />
                <p className="text-gray-600 font-medium mb-1">Upload a PDF Document</p>
                <p className="text-sm text-gray-400 mb-4">We will generate an AI-searchable structure</p>
                <label className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                  Select File
                  <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
                </label>
              </>
            )}
          </div>
        </div>

        {/* Chat Window */}
        <div className="flex-1 bg-white border rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <Bot className="w-12 h-12 mb-3 text-gray-300" />
                <p>Upload a document and ask a question to begin.</p>
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-blue-600 ml-3' : 'bg-gray-200 mr-3'}`}>
                    {msg.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-gray-600" />}
                  </div>
                  <div className={`px-4 py-3 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-100 text-gray-800 rounded-tl-none'}`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              </div>
            ))}
            
            {isThinking && (
              <div className="flex justify-start">
                <div className="flex max-w-[80%] flex-row">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-indigo-100 mr-3">
                    <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-tl-none flex items-center">
                    <span className="text-sm font-medium">{thoughtStatus}</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input Area */}
          <div className="p-4 border-t bg-gray-50">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={uploadSuccess ? "Ask a question about the document..." : "Upload a document first..."}
                disabled={!uploadSuccess || isThinking}
                className="flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
              />
              <button
                type="submit"
                disabled={!uploadSuccess || isThinking || !input.trim()}
                className="bg-blue-600 text-white px-5 py-3 rounded-xl hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
