import {useState} from 'react'
import axios from 'axios'
import Login from './Login'

export default function App(){
  const[token,setToken]=useState(null)
  const[msg,setMsg]=useState('')
  const[chat,setChat]=useState([])

  if(!token) return <Login setToken={setToken}/>

  const send=async()=>{
    const r=await axios.post('http://localhost:8000/api/chat',
      {message:msg},
      {headers:{Authorization:token}}
    )

    setChat([...chat,{u:msg,a:r.data.response}])
    setMsg('')
  }

  return(
    <div>
      {chat.map((c,i)=>(<div key={i}>{c.u} → {c.a}</div>))}
      <input value={msg} onChange={e=>setMsg(e.target.value)} />
      <button onClick={send}>Send</button>
    </div>
  )
}