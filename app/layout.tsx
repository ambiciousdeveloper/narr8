import "./globals.css";
import Sidebar from "./components/Sidebar";
import { LanguageProvider } from "./context/LanguageContext";
import { ProjectProvider } from "./context/ProjectContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <LanguageProvider>
          <ProjectProvider>
            <div className="flex min-h-screen bg-[#0f0f12] text-white font-sans overflow-hidden selection:bg-purple-500/30">
              <Sidebar />
              <main className="flex-1 ml-20 lg:ml-24 relative z-10">
                {/* Background Ambience moved here for global effect */}
                <div className="fixed inset-0 z-0 opacity-20 pointer-events-none">
                  <div className="absolute top-[-50%] left-[-20%] w-[1000px] h-[1000px] rounded-full bg-purple-900 blur-[120px] mix-blend-screen animate-pulse" />
                </div>
                {children}
              </main>
            </div>
          </ProjectProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
