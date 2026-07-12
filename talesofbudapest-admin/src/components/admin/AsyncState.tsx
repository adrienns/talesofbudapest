import styles from './AdminDashboard.module.css'

type AsyncStateProps = {
  mode: 'loading' | 'error' | 'empty'
  message?: string | null
  onRetry?: () => void
}

export const AsyncState = ({ mode, message, onRetry }: AsyncStateProps) => (
  <div className={styles.state} role={mode === 'error' ? 'alert' : 'status'}>
    <div>
      {mode === 'loading' ? (
        <><div className={styles.skeleton} /><p>Reading the archive ledger…</p></>
      ) : (
        <p>{message ?? (mode === 'empty' ? 'Nothing here yet.' : 'The ledger could not be loaded.')}</p>
      )}
      {mode === 'error' && onRetry && (
        <button className={styles.retry} type="button" onClick={onRetry}>Try again</button>
      )}
    </div>
  </div>
)
