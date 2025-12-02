'use client';

import React from 'react';

import { RequireAdmin } from '@/components/layout';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
