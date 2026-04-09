import {useState} from 'react'
import axios from 'axios'

export default function Login({setToken}){
  const[u,setU]=useState('')
  const[p,setP]=useState('')

  const login=async()=>{
    const r=await axios.post('http://localhost:8000/api/login',{username:u,password:p})
    setToken(r.data.token)
  }

  return(
    <div>
      <input onChange={e=>setU(e.target.value)} />
      <input onChange={e=>setP(e.target.value)} />
      <button onClick={login}>Login</button>
    </div>
  )
}