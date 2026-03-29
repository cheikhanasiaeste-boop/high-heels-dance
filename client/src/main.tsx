import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { supabase } from "./lib/supabase";
import "./index.css";
import { Toaster } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,         // Default is 3 — reduces failed-query delay from 7s → ~1s
      staleTime: 30_000, // 30s — prevents redundant refetches on window focus
    },
  },
});

// Log errors for debugging but don't automatically redirect guests
// Components should handle unauthorized errors explicitly when needed
queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async headers() {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return {};
        return { Authorization: `Bearer ${session.access_token}` };
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Toaster position="top-right" richColors />
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </ErrorBoundary>
);
