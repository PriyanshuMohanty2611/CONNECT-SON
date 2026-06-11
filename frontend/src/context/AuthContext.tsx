import React, { createContext, useState, useEffect, useContext } from 'react'
import { api, getTokens, setTokens, clearTokens } from '../services/api'
import { initE2EE } from '../services/crypto'

export interface UserProfile {
  id: string
  username: string
  email: string
  phone?: string
  is_verified: boolean
  is_admin?: boolean
  created_at: string
  profile?: {
    full_name: string
    bio?: string
    avatar_url?: string
    cover_url?: string
    dob?: string
    gender?: string
    country?: string
    theme_preference: string
    presence_status: string
    public_key?: string
  }
}

interface AuthContextType {
  user: UserProfile | null
  loading: boolean
  error: string | null
  registrationEmail: string | null
  twoFaRequired: boolean
  twoFaSessionId: string | null
  login: (usernameOrEmail: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; requires2Fa?: boolean }>
  verify2FaLogin: (code: string, rememberMe?: boolean) => Promise<boolean>
  register: (data: any) => Promise<boolean>
  verifyOTP: (code: string, purpose: 'registration' | 'password_reset', rememberMe?: boolean) => Promise<boolean>
  requestPasswordResetOTP: (email: string) => Promise<boolean>
  resetPassword: (data: any) => Promise<boolean>
  logout: () => void
  refreshUser: () => Promise<void>
  updateProfile: (profileData: any) => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [registrationEmail, setRegistrationEmail] = useState<string | null>(
    localStorage.getItem('registration_email')
  )
  const [twoFaRequired, setTwoFaRequired] = useState<boolean>(false)
  const [twoFaSessionId, setTwoFaSessionId] = useState<string | null>(null)

  const loadCurrentUser = async () => {
    const { access } = getTokens()
    if (!access) {
      setUser(null)
      setLoading(false)
      return
    }

    try {
      const response = await api.get<UserProfile>('/users/me')
      if (response.data) {
        setUser(response.data)
        const theme = response.data.profile?.theme_preference || 'tiimi'
        document.documentElement.setAttribute('data-theme', theme)
        
        // Initialize E2EE silently
        try {
          const username = response.data.username
          initE2EE(username).then(({ publicKeyBase64 }) => {
            // Update local user's profile public key if it was updated
            setUser(prev => {
              if (prev && prev.profile) {
                if (prev.profile.public_key === publicKeyBase64) return prev
                return {
                  ...prev,
                  profile: { ...prev.profile, public_key: publicKeyBase64 }
                }
              }
              return prev
            })
          }).catch(err => {
            console.error("Failed to initialize E2EE keys silently:", err)
          })
        } catch (e) {
          console.error("Failed to initialize E2EE keys on startup:", e)
        }
      } else {
        clearTokens()
        setUser(null)
      }
    } catch {
      clearTokens()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCurrentUser()
  }, [])

  const login = async (usernameOrEmail: string, password: string, rememberMe: boolean = false) => {
    setLoading(true)
    setError(null)
    setTwoFaRequired(false)
    setTwoFaSessionId(null)

    const { data, error: apiErr } = await api.post<{
      access_token?: string;
      refresh_token?: string;
      token_type: string;
      two_fa_session_id?: string;
    }>(
      '/auth/login',
      { username_or_email: usernameOrEmail, password, remember_me: rememberMe }
    )

    if (apiErr) {
      setError(apiErr)
      setLoading(false)
      return { success: false }
    }

    if (data) {
      if (data.token_type === '2fa_required' && data.two_fa_session_id) {
        setTwoFaRequired(true)
        setTwoFaSessionId(data.two_fa_session_id)
        setLoading(false)
        return { success: true, requires2Fa: true }
      }

      setTokens(data.access_token!, data.refresh_token!, rememberMe)
      await loadCurrentUser()
      return { success: true, requires2Fa: false }
    }

    setLoading(false)
    return { success: false }
  }

  const verify2FaLogin = async (code: string, rememberMe: boolean = false) => {
    setLoading(true)
    setError(null)

    if (!twoFaSessionId) {
      setError('2FA session has expired or is invalid. Please login again.')
      setLoading(false)
      return false
    }

    const { data, error: apiErr } = await api.post<{ access_token: string; refresh_token: string }>(
      '/auth/login/2fa',
      { two_fa_session_id: twoFaSessionId, code }
    )

    if (apiErr) {
      setError(apiErr)
      setLoading(false)
      return false
    }

    if (data) {
      setTokens(data.access_token, data.refresh_token, rememberMe)
      setTwoFaRequired(false)
      setTwoFaSessionId(null)
      await loadCurrentUser()
      return true
    }

    setLoading(false)
    return false
  }

  const register = async (formData: any) => {
    setLoading(true)
    setError(null)
    const { error: apiErr } = await api.post('/auth/register', formData)

    if (apiErr) {
      setError(apiErr)
      setLoading(false)
      return false
    }

    // Cache the email so that the OTP screen knows where to send verification
    setRegistrationEmail(formData.email)
    localStorage.setItem('registration_email', formData.email)
    setLoading(false)
    return true
  }

  const verifyOTP = async (code: string, purpose: 'registration' | 'password_reset', rememberMe: boolean = false) => {
    setLoading(true)
    setError(null)
    const email = registrationEmail
    if (!email) {
      setError('Registration email context is missing. Please sign up again.')
      setLoading(false)
      return false
    }

    const { data, error: apiErr } = await api.post<{ access_token: string; refresh_token: string }>(
      '/auth/verify-otp',
      { email, code, purpose }
    )

    if (apiErr) {
      setError(apiErr)
      setLoading(false)
      return false
    }

    if (data) {
      setTokens(data.access_token, data.refresh_token, rememberMe)
      localStorage.removeItem('registration_email')
      setRegistrationEmail(null)
      await loadCurrentUser()
      return true
    }

    setLoading(false)
    return false
  }

  const requestPasswordResetOTP = async (email: string) => {
    setLoading(true)
    setError(null)
    const { error: apiErr } = await api.post('/auth/forgot-password', { email, purpose: 'password_reset' })

    if (apiErr) {
      setError(apiErr)
      setLoading(false)
      return false
    }

    setRegistrationEmail(email)
    localStorage.setItem('registration_email', email)
    setLoading(false)
    return true
  }

  const resetPassword = async (formData: any) => {
    setLoading(true)
    setError(null)
    const email = registrationEmail
    if (!email) {
      setError('Email context is missing. Please initiate request again.')
      setLoading(false)
      return false
    }

    const { error: apiErr } = await api.post('/auth/reset-password', {
      email,
      code: formData.code,
      new_password: formData.new_password,
      confirm_password: formData.confirm_password,
    })

    if (apiErr) {
      setError(apiErr)
      setLoading(false)
      return false
    }

    localStorage.removeItem('registration_email')
    setRegistrationEmail(null)
    setLoading(false)
    return true
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch (e) {
      console.error("Failed to call logout API, clearing frontend tokens anyway", e)
    }
    clearTokens()
    setUser(null)
    setTwoFaRequired(false)
    setTwoFaSessionId(null)
    document.documentElement.setAttribute('data-theme', 'tiimi')
  }

  const updateProfile = async (profileData: any) => {
    setError(null)
    const { data, error: apiErr } = await api.put<UserProfile>('/users/me', profileData)
    if (apiErr) {
      setError(apiErr)
      return false
    }
    if (data) {
      setUser(data)
      if (data.profile?.theme_preference) {
        document.documentElement.setAttribute('data-theme', data.profile.theme_preference)
      }
      return true
    }
    return false
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        registrationEmail,
        twoFaRequired,
        twoFaSessionId,
        login,
        verify2FaLogin,
        register,
        verifyOTP,
        requestPasswordResetOTP,
        resetPassword,
        logout,
        refreshUser: loadCurrentUser,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
