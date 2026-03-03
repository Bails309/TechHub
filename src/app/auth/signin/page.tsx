import type { Metadata } from 'next';
import SignInPageClient from './SignInPageClient';

export const metadata: Metadata = {
  title: 'Sign In | TechHub',
};

export default function SignInPage() {
  return <SignInPageClient />;
}
