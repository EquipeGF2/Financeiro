export const metadata = { title: "Financeiro" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br">
      <body style={{ fontFamily: "Inter, system-ui, sans-serif", margin: 24 }}>
        {children}
      </body>
    </html>
  );
}
