import axios from "axios"

// ✅ 여기 추가 (파일 최상단)
const API_BASE_URL =
  window.location.hostname === "localhost"
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.VITE_API_BASE_URL_IP

// --------------------
// Login
// --------------------
export const login = async (username: string, password: string) => {
  const params = new URLSearchParams()
  params.append("username", username)
  params.append("password", password)

  const res = await axios.post(
    `${API_BASE_URL}/api/v1/login/access-token`,
    params,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  )

  return res.data
}

// --------------------
// Signup
// --------------------
export const signup = async (data: {
  email: string
  full_name: string
  password: string
}) => {
  const res = await axios.post(`${API_BASE_URL}/api/v1/users/signup`, data, {
    headers: { "Content-Type": "application/json" },
  })
  return res.data
}
