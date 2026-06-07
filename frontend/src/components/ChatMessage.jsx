import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

const markdownComponents = {
  code({ className, children }) {
    const match = /language-(\w+)/.exec(className || '')

    return match ? (
      <SyntaxHighlighter
        style={oneDark}
        language={match[1]}
        PreTag="div"
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    ) : (
      <code className={className}>
        {children}
      </code>
    )
  }
}

function ChatMessage({ message, isLastStreaming }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div>
        <b>You:</b> {message.u}
      </div>

      <div
        style={{
          background: '#f5f5f5',
          padding: 8,
          position: 'relative'
        }}
      >
        <ReactMarkdown
          remarkPlugins={[
            remarkGfm,
            remarkMath
          ]}
          rehypePlugins={[
            rehypeRaw,
            rehypeKatex
          ]}
          components={markdownComponents}
        >
          {message.a}
        </ReactMarkdown>

        {isLastStreaming && (
          <span className="streaming-cursor">
            ▋
          </span>
        )}
      </div>
    </div>
  )
}

export default React.memo(ChatMessage)