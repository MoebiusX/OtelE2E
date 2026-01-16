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
import { TransparencyDashboard } from "@/components/transparency-dashboard";

function Router() {
  return (
    <Switch>
      {/* Public transparency landing page */}
      <Route path="/" component={TransparencyDashboard} />
      
      {/* User Journey: Registration → Login → Trading */}
      <Route path="/register" component={Register} />
      <Route path="/login" component={Login} />
      <Route path="/trading" component={Dashboard} />
      <Route path="/my-wallet" component={MyWallet} />
      <Route path="/convert" component={Convert} />
      
      {/* Monitoring & Analytics */}
      <Route path="/monitor" component={Monitor} />
      
      {/* Demo (legacy trading UI - will be removed later) */}
      <Route path="/demo" component={Dashboard} />
      
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
