import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import Monitor from "@/pages/monitor";
import Register from "@/pages/register";
import Login from "@/pages/login";
import MyWallet from "@/pages/my-wallet";
import Convert from "@/pages/convert";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/monitor" component={Monitor} />
      <Route path="/register" component={Register} />
      <Route path="/login" component={Login} />
      <Route path="/my-wallet" component={MyWallet} />
      <Route path="/convert" component={Convert} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
