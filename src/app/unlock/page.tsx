'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UnlockPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/unlock', {
      method: 'POST',
      body: JSON.stringify({ password }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      router.push('/');
    } else {
      setError(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm space-y-4"
      >
        <h1 className="text-xl font-semibold text-gray-900">RivalRadar</h1>
        <p className="text-sm text-gray-500">Enter the site password to continue.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(false);
          }}
          placeholder="Password"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5B4EE8]"
          autoFocus
        />
        {error && <p className="text-sm text-red-500">Incorrect password.</p>}
        <button
          type="submit"
          className="w-full bg-[#5B4EE8] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#4a3ed0] transition-colors"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
