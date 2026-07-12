import Link from 'next/link'
import styles from './AdminDashboard.module.css'

export const DashboardShell = ({ children }: { children: React.ReactNode }) => (
  <div className={styles.shell}>
    <a className={styles.skipLink} href="#main-content">Skip to content</a>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <span className={styles.eyebrow}>Knowledge operations</span>
        <span className={styles.brandName}>Tales of Budapest</span>
      </Link>
      <nav className={styles.nav} aria-label="Admin navigation">
        <Link className={styles.navLink} href="/">Overview</Link>
        <Link className={styles.navLink} href="/insights">Insights</Link>
        <Link className={styles.navLink} href="/reviews">Review inbox</Link>
        <Link className={styles.navLink} href="/graph">Graph explorer</Link>
      </nav>
      <form action="/api/auth/logout" method="post">
        <button className={styles.signOut} type="submit">Sign out</button>
      </form>
    </header>
    <main id="main-content" className={styles.main}>{children}</main>
  </div>
)
