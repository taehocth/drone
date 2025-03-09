import type { ApiError } from "@/client"

export const ERROR_MESSAGES = {
  email: {
    pattern: "올바른 이메일 형식이 아닙니다.",
  },
  name: {
    message: "사용할 수 없는 이름입니다.",
  },
  password: {
    minLength: "비밀번호는 최소 8자리 입니다.",
    confirmPassword: "비밀번호가 일치하지 않습니다.",
  },
  common: {
    required: "필수 입력 항목입니다.",
    loginFailed: "로그인에 실패했습니다. 다시 시도해 주세요.",
  }
};

export const handleError = (err: ApiError, showToast: any) => {
  const errDetail = (err.body as any)?.detail
  let errorMessage = errDetail || "알 수 없는 에러가 발생 했습니다."
  if (Array.isArray(errDetail) && errDetail.length > 0) {
    errorMessage = errDetail[0].msg
  }
  showToast(`Error detail: ${errorMessage}`)
}

export const emailPattern = {
  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
  message: ERROR_MESSAGES.email.pattern,
}

export const namePattern = {
  value: /^[A-Za-z\s\u00C0-\u017F]{1,30}$/,
  message: ERROR_MESSAGES.name.message,
}

export const passwordRules = () => {
  const rules: any = {
    required: ERROR_MESSAGES.common.required,
    minLength: {
      value: 8,
      message: ERROR_MESSAGES.password.minLength,
    },
  }

  return rules
}

export const confirmPasswordRules = (
  getValues: () => any,
) => {
  const rules: any = {
    required: ERROR_MESSAGES.password.confirmPassword,
    validate: (value: string) => {
      const password = getValues().password || getValues().new_password
      return value === password ? true : ERROR_MESSAGES.password.confirmPassword
    },
  }

  return rules
}