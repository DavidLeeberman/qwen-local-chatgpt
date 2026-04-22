import { useState, useEffect } from 'react'
import axios from 'axios'
import Login from './Login'

export default function App() {
  const [token, setToken] = useState(null)
  const [msg, setMsg] = useState('')
  const [chat, setChat] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => {
    const t = localStorage.getItem('token')
    if (t) setToken(t)
  }, [])

  const send = async () => {
    if (!msg) return

    try {
      const r = await axios.post(
        // 'http://localhost:8000/api/chat',
        // Vite replaces this during build/dev with the value from .env
        `${import.meta.env.VITE_API_URL}/api/chat`,
        { message: msg },
        { headers: { Authorization: token } }
      )

      setChat([...chat, { u: msg, a: r.data.response }])
      setMsg('')
      setErr('')
    } catch (e) {
      setErr('Chat failed')
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setChat([])
  }

  if (!token) return <Login setToken={setToken} />

  return (
    <div>
      <h2>Chat</h2>

      <button onClick={logout}>Logout</button>

      <div>
        {chat.map((c, i) => (
          <div key={i}>
            <b>You:</b> {c.u} <br />
            <b>AI:</b> {c.a}
            <hr />
          </div>
        ))}
      </div>

      <input
        value={msg}
        onChange={e => setMsg(e.target.value)}
        placeholder="Say something..."
      />

      <button onClick={send}>Send</button>

      {err && <div style={{ color: 'red' }}>{err}</div>}
    </div>
  )
}