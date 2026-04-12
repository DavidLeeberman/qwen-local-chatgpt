import { useState } from 'react'
import axios from 'axios'

export default function Login({ setToken }) {
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')

  const login = async () => {
    try {
      const r = await axios.post('http://localhost:8000/api/login', {
        username: u,
        password: p
      })

      localStorage.setItem('token', r.data.token)   // ✅ persist
      setToken(r.data.token)

      setU('')
      setP('')
      setErr('')
    } catch (e) {
      setErr('Login failed')
    }
  }

  return (
    <div>
      <h2>Login</h2>

      <input
        value={u}
        onChange={e => setU(e.target.value)}
        placeholder="username"
      />

      <input
        type="password"
        value={p}
        onChange={e => setP(e.target.value)}
        placeholder="password"
      />

      <button onClick={login}>Login</button>

      {err && <div style={{ color: 'red' }}>{err}</div>}
    </div>
  )
}