import { GraduationCap } from 'lucide-react';
import styles from '../styles/WelcomeScreen.module.css';

export default function WelcomeScreen({ name }: { name?: string | null }) {
  return (
    <main className={styles.screen} aria-live="polite" role="status">
      <div className={styles.content}>
        <div className={styles.emblem} aria-hidden="true">
          <GraduationCap size={34} />
        </div>
        <p className={styles.school}>DAR-E-ARQAM</p>
        <h1 className={styles.greeting} key={name || 'loading'}>
          {name ? `Welcome back, ${name}` : 'Welcome back'}
        </h1>
        <div className={styles.progress} aria-hidden="true">
          <span />
        </div>
        <span className="sr-only">Loading your workspace</span>
      </div>
    </main>
  );
}
