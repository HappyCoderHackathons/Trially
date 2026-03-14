"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useToast } from "@/hooks/use-toast"
import { BackgroundDecorations } from "@/components/background-decorations"
import { TriallyLogo } from "@/components/trially-logo"
import { signInWithEmail, signUpWithEmail } from "@/lib/cognito"

const authSchema = z.object({
  email: z.string().email("Please enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
})

type AuthValues = z.infer<typeof authSchema>

export default function AuthPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<AuthValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const onSubmit = async (values: AuthValues) => {
    setIsSubmitting(true)
    try {
      if (mode === "signup") {
        await signUpWithEmail(values.email, values.password)
        toast({
          title: "Account created",
          description: "Your account has been created. You can now sign in.",
        })
        setMode("login")
      } else {
        const session = await signInWithEmail(values.email, values.password)

        if (typeof window !== "undefined") {
          const payload = {
            idToken: session.getIdToken().getJwtToken(),
            accessToken: session.getAccessToken().getJwtToken(),
            refreshToken: session.getRefreshToken().getToken(),
          }
          window.localStorage.setItem(
            "trially_cognito_session",
            JSON.stringify(payload),
          )
        }

        toast({
          title: "Welcome back",
          description: "You’re now signed in.",
        })
        router.push("/")
      }
    } catch (error: any) {
      const message =
        error?.message ||
        "Something went wrong while talking to Cognito. Please try again."
      toast({
        title: "Authentication error",
        description: message,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      <BackgroundDecorations />

      <div className="relative z-10 w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3">
          <TriallyLogo size="sm" />
          <p className="text-muted-foreground text-sm text-center max-w-sm">
            Create an account or sign in to save your progress and keep track of
            clinical trials that matter to you.
          </p>
        </div>

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as "login" | "signup")}
          className="bg-card/80 border border-border/80 rounded-2xl shadow-lg p-6 backdrop-blur-sm"
        >
          <TabsList className="w-full mb-4">
            <TabsTrigger value="login">Log in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          autoComplete="email"
                          {...field}
                        />
                      </FormControl>
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
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your password"
                          autoComplete="current-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full mt-2"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Signing in..." : "Continue"}
                </Button>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="signup">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          autoComplete="email"
                          {...field}
                        />
                      </FormControl>
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
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Create a password"
                          autoComplete="new-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full mt-2"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating account..." : "Create account"}
                </Button>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </div>

      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
    </main>
  )
}

