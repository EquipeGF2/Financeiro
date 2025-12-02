'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Loading } from '@/components/ui';
import { getUserSession, hasActiveSession, isAdminUserName } from '@/lib/userSession';

type AccessStatus = 'verificando' | 'autorizado' | 'negado';

/**
 * Garante que apenas usuários administradores acessem as rotas internas de administração.
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<AccessStatus>('verificando');

  useEffect(() => {
    if (!hasActiveSession()) {
      router.replace('/');
      return;
    }

    const session = getUserSession();
    if (!isAdminUserName(session.userName)) {
      router.replace('/dashboard');
      setStatus('negado');
      return;
    }

    setStatus('autorizado');
  }, [router]);

  if (status !== 'autorizado') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loading message="Verificando permissões de acesso..." />
      </div>
    );
  }

  return <>{children}</>;
}

export default RequireAdmin;
