import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

// import { atomDark } from ...
// import { vscDarkPlus } from ...
// import { materialDark } from ...

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
  // Virtuoso requires a single root element per item, so we wrap the pair in a parent div
  return (
    <div className="message-pair">
      
      {/* 10. User Message Row (Rendered on the Right) */}
      {message.u && (
        <div className="message-row user">
          <div className="message-row-inner">
            <div className="message-bubble">
              {message.u}
            </div>
          </div>
        </div>
      )}

      {/* 10. Assistant Message Row (Rendered on the Left) */}
      {(message.a || isLastStreaming) && (
        <div className="message-row assistant">
          <div className="message-row-inner">
            <div className="message-bubble">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeRaw, rehypeKatex]}
                components={markdownComponents}
              >
                {message.a}
              </ReactMarkdown>

              {isLastStreaming && (
                <span className="streaming-cursor">▋</span>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default React.memo(ChatMessage)