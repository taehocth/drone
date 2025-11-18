import axios from "axios"

export const login = async (username: string, password: string) => {
  const params = new URLSearchParams()
  params.append("username", username)
  params.append("password", password)

  const res = await axios.post(
    `${import.meta.env.VITE_API_URL}/api/v1/login/access-token`,
    params,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  )

  return res.data
}

// ✅ 회원가입 함수 추가
export const signup = async (data: {
  email: string
  full_name: string
  password: string
}) => {
  const res = await axios.post(
    `${import.meta.env.VITE_API_URL}/api/v1/users/signup`,
    data,
    {
      headers: { "Content-Type": "application/json" },
    },
  )
  return res.data
}
