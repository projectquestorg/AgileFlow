"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">◊</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">AgileFlow</h1>
          </div>
          <nav className="flex gap-4">
            <Button variant="ghost">Docs</Button>
            <Button variant="ghost">GitHub</Button>
            <Button>Get Started</Button>
          </nav>
        </div>

        {/* Hero Section */}
        <div className="grid md:grid-cols-2 gap-12 items-center mb-20">
          <div>
            <Badge className="mb-4">Intelligent Project Management</Badge>
            <h2 className="text-5xl font-bold tracking-tight text-foreground mb-6">
              AgileFlow Dashboard
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Intelligent AI-powered project management and orchestration. Streamline your development workflow with multi-agent coordination and real-time insights.
            </p>
            <div className="flex gap-4">
              <Button size="lg" className="bg-primary hover:bg-primary/90">
                Launch Dashboard
              </Button>
              <Button size="lg" variant="outline">
                View Demo
              </Button>
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-8 shadow-lg">
            <div className="space-y-4">
              <div className="h-3 bg-primary/20 rounded w-3/4"></div>
              <div className="h-3 bg-primary/15 rounded w-full"></div>
              <div className="h-3 bg-primary/15 rounded w-5/6"></div>
              <div className="mt-6 pt-6 border-t border-border">
                <div className="h-3 bg-primary/20 rounded w-1/2 mb-3"></div>
                <div className="h-3 bg-primary/15 rounded w-full"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="mb-20">
          <h3 className="text-3xl font-bold text-foreground mb-12 text-center">
            Key Features
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Multi-Agent Coordination</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Orchestrate multiple specialized agents working in concert for complex project management tasks.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Real-Time Status Tracking</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Monitor story status, blockers, and progress across your entire development team in real-time.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Intelligent Orchestration</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  AI-powered task delegation and workflow optimization that learns from your development patterns.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid md:grid-cols-4 gap-8 mb-20">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Stories</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">48</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>In Progress</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">3</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">42</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completion Rate</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">87.5%</div>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/50">
          <CardHeader className="text-center">
            <CardTitle>Ready to get started?</CardTitle>
            <CardDescription className="mt-2">
              Connect AgileFlow to your project and start managing intelligently today.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-4">
            <Button size="lg" className="bg-primary">
              Get Started
            </Button>
            <Button size="lg" variant="outline">
              Learn More
            </Button>
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="mt-20 pt-12 border-t border-border">
          <div className="flex justify-between items-center text-muted-foreground text-sm">
            <p>&copy; 2024 AgileFlow. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-foreground transition">Privacy</a>
              <a href="#" className="hover:text-foreground transition">Terms</a>
              <a href="#" className="hover:text-foreground transition">Contact</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
