'use client'

import { FormEvent, useState } from 'react'

export default function LoginPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function logIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/auth/login', {
        body: JSON.stringify({ password: form.get('password') }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(body.error || 'Could not sign in')
        return
      }
      window.location.assign('/')
    } catch {
      setError('The admin site is unavailable')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <p style={styles.eyebrow}>TALES OF BUDAPEST</p>
        <h1 style={styles.heading}>Archive Console</h1>
        <p style={styles.intro}>Private access to research, matching, and publication review.</p>
        <form onSubmit={logIn} style={styles.form}>
          <label htmlFor="password" style={styles.label}>Admin password</label>
          <input autoComplete="current-password" autoFocus id="password" name="password" required style={styles.input} type="password" />
          {error ? <p role="alert" style={styles.error}>{error}</p> : null}
          <button disabled={loading} style={{ ...styles.button, opacity: loading ? 0.65 : 1 }} type="submit">
            {loading ? 'Opening archive…' : 'Enter archive'}
          </button>
        </form>
      </section>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  main: { alignItems: 'center', display: 'flex', justifyContent: 'center', minHeight: '100vh', padding: '24px' },
  card: { background: 'rgba(16, 27, 25, .92)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', maxWidth: '430px', padding: '42px', width: '100%' },
  eyebrow: { color: 'var(--accent)', fontSize: '11px', fontWeight: 700, letterSpacing: '.19em', margin: '0 0 20px' },
  heading: { fontFamily: 'Georgia, serif', fontSize: '38px', fontWeight: 500, letterSpacing: '-.03em', margin: 0 },
  intro: { color: 'var(--muted)', lineHeight: 1.6, margin: '14px 0 30px' },
  form: { display: 'grid', gap: '12px' },
  label: { color: 'var(--muted)', fontSize: '13px', fontWeight: 600 },
  input: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text)', outline: 'none', padding: '13px 14px', width: '100%' },
  error: { color: 'var(--danger)', fontSize: '13px', margin: '2px 0' },
  button: { background: 'var(--accent)', border: 0, borderRadius: '10px', color: '#17130b', fontWeight: 750, marginTop: '7px', padding: '13px 16px' },
}
