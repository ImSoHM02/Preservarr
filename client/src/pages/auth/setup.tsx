import React from "react";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Lock, User, ShieldCheck } from "lucide-react";

const setupSchema = z
  .object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SetupForm = z.infer<typeof setupSchema>;

export default function SetupPage() {
  const { checkSetup } = useAuth();
  const { toast } = useToast();

  const form = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
    },
  });

  const setupMutation = useMutation({
    mutationFn: async (data: SetupForm) => {
      const res = await apiRequest("POST", "/api/auth/setup", {
        username: data.username,
        password: data.password,
      });
      return res.json();
    },
    onSuccess: async (data) => {
      localStorage.setItem("token", data.token);
      await checkSetup();
      toast({ title: "Setup complete! Welcome." });
      // Force reload to pick up auth state or navigate
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({
        title: "Setup failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SetupForm) => {
    setupMutation.mutate(data);
  };

  return (
    <div className="page-auth-setup__screen">
      <Card className="page-auth-login__max-width-md-width-full">
        <CardHeader className="page-auth-login__text-center">
          <div className="page-auth-setup__logo-wrap">
            <ShieldCheck className="page-auth-setup__text-primary-height-8-width-8" />
          </div>
          <CardTitle className="page-auth-login__text-2xl-font-bold">Initial Setup</CardTitle>
          <CardDescription>Create your admin account to get started</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="page-auth-login__space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <div className="page-auth-login__relative">
                      <User className="page-auth-login__input-icon" />
                      <FormControl>
                        <Input
                          className="cmp-igdbsearchmodal__padding-left-9"
                          placeholder="Choose a username"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <div className="page-auth-login__relative">
                      <Lock className="page-auth-login__input-icon" />
                      <FormControl>
                        <Input
                          type="password"
                          className="cmp-igdbsearchmodal__padding-left-9"
                          placeholder="Choose a password"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <div className="page-auth-login__relative">
                      <Lock className="page-auth-login__input-icon" />
                      <FormControl>
                        <Input
                          type="password"
                          className="cmp-igdbsearchmodal__padding-left-9"
                          placeholder="Confirm your password"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="page-auth-login__width-full"
                disabled={setupMutation.isPending}
              >
                {setupMutation.isPending ? "Creating Account..." : "Create Account"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
