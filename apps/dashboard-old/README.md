# AgileFlow Dashboard

A modern, intelligent dashboard for AgileFlow project management and orchestration built with Next.js 14, React 18, Tailwind CSS, and shadcn/ui components.

## Overview

The AgileFlow Dashboard is a responsive web application designed to provide real-time insights into project status, multi-agent coordination, and intelligent workflow management. It showcases the AgileFlow brand identity with a burnt orange/terracotta primary color (#e8683a).

## Features

- **Multi-Agent Coordination**: Orchestrate multiple specialized agents working in concert
- **Real-Time Status Tracking**: Monitor story status, blockers, and progress
- **Intelligent Orchestration**: AI-powered task delegation and workflow optimization
- **Responsive Design**: Mobile-first design that works on all screen sizes
- **Modern UI Components**: Built with shadcn/ui and Tailwind CSS
- **Type-Safe**: Full TypeScript support

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui with custom components
- **Font**: JetBrains Mono (monospace)
- **Icons**: Lucide React
- **Package Manager**: npm

## Project Structure

```
dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout with JetBrains Mono font
│   │   ├── page.tsx           # Landing page component
│   │   ├── globals.css        # Global styles with design tokens
│   │   └── favicon.ico
│   ├── components/
│   │   └── ui/                # shadcn/ui components
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       └── badge.tsx
│   └── lib/
│       └── utils.ts           # Utility functions (cn helper)
├── public/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── README.md
```

## Design System

### Colors

All colors are defined as CSS variables in `src/app/globals.css` for easy theming and consistency.

#### Primary Color (Brand)
- **Value**: hsl(15 85% 57%) — #e8683a
- **Usage**: Primary buttons, links, accents, and brand elements

#### Semantic Colors
- **Primary**: Brand color for interactive elements
- **Secondary**: Secondary actions and less prominent UI
- **Destructive**: Dangerous actions like delete
- **Accent**: Highlights and important information
- **Muted**: Disabled states and secondary text

#### Light/Dark Modes
The design system includes both light and dark mode CSS variables for accessibility and user preference.

### Typography

- **Font Family**: JetBrains Mono (monospace)
- **Base Font Size**: 16px (1rem)
- **Line Heights**: Tight (1.25), Normal (1.5), Relaxed (1.75)

### Spacing

Uses an 8px spacing scale for consistent padding, margins, and gaps:
- xs: 4px (0.25rem)
- sm: 8px (0.5rem)
- md: 16px (1rem)
- lg: 24px (1.5rem)
- xl: 32px (2rem)
- 2xl: 48px (3rem)

### Border Radius

- sm: 4px
- md: 6px
- lg: 8px
- full: 9999px (fully rounded)

## UI Components

### Button

Primary interactive component with multiple variants:

```tsx
import { Button } from "@/components/ui/button"

<Button>Default</Button>
<Button variant="primary">Primary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Delete</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
```

### Card

Container component for grouping related content:

```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
  </CardHeader>
  <CardContent>
    Card content goes here
  </CardContent>
</Card>
```

### Badge

Small label component for tags and status indicators:

```tsx
import { Badge } from "@/components/ui/badge"

<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="outline">Outline</Badge>
```

### Input

Form input field component:

```tsx
import { Input } from "@/components/ui/input"

<Input placeholder="Enter text..." type="text" />
```

### Label

Form label component:

```tsx
import { Label } from "@/components/ui/label"

<Label htmlFor="name">Name</Label>
```

## Installation & Development

### Prerequisites

- Node.js 18.x or higher
- npm or yarn

### Install Dependencies

```bash
npm install --legacy-peer-deps
```

The `--legacy-peer-deps` flag is required due to TensorFlow.js version conflicts with some dependencies.

### Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `.next` directory.

### Start Production Server

```bash
npm start
```

### Lint Code

```bash
npm run lint
```

## Styling Guidelines

### Using Design Tokens

Always use CSS variables instead of hardcoded values:

```tsx
// ❌ Avoid
<div style={{ color: '#e8683a' }}>Text</div>

// ✅ Prefer
<div className="text-primary">Text</div>
<button className="bg-primary text-primary-foreground">Button</button>
```

### Tailwind CSS Classes

The project uses Tailwind CSS with custom CSS variable tokens for complete design system integration:

```tsx
// Color utilities
<div className="bg-primary text-primary-foreground" />
<div className="text-muted-foreground" />
<div className="border-border" />

// Spacing utilities
<div className="p-4 m-2 gap-6" />

// Border radius
<div className="rounded-lg" />

// Responsive design (mobile-first)
<div className="w-full md:w-1/2 lg:w-1/3" />
```

## Component Development

### Creating New Components

1. Create component file in `src/components/`
2. Use TypeScript for type safety
3. Import and use the `cn` utility for class merging:

```tsx
import { cn } from "@/lib/utils"

export const MyComponent = ({ className, ...props }) => (
  <div className={cn("base-styles", className)} {...props} />
)
```

4. Export from component module
5. Use in pages or other components

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Connect repository to Vercel
3. Vercel will auto-detect Next.js and configure settings
4. Deploy with a single click

### Other Platforms

The dashboard can be deployed to any platform supporting Next.js:

- AWS Amplify
- Netlify
- Docker containers
- Self-hosted servers

## Environment Variables

Create a `.env.local` file for local development:

```env
# Add any required environment variables here
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Accessibility

The dashboard is built with accessibility in mind:

- Semantic HTML elements
- ARIA labels where appropriate
- Keyboard navigation support
- Color contrast compliance (WCAG AA)
- Screen reader friendly

## Performance

- Code splitting and dynamic imports
- Image optimization
- CSS and JavaScript minification
- Production builds are optimized for performance

## Contributing

When contributing to the dashboard:

1. Follow the established component patterns
2. Use design tokens for styling consistency
3. Add TypeScript types to all components
4. Test responsive design on mobile devices
5. Ensure accessibility is maintained

## Known Issues

- Node.js 18.20.8 has some compatibility warnings with newer dependencies, but everything works correctly
- The project requires `--legacy-peer-deps` flag due to conflicting peer dependencies
- Next.js versions requiring Node.js >=20.9.0 cannot be used with the current environment

## Future Enhancements

- [ ] Dark mode toggle UI
- [ ] Real-time data integration
- [ ] Dashboard customization
- [ ] Advanced analytics
- [ ] User authentication
- [ ] API integration for story management
- [ ] WebSocket support for live updates

## License

AgileFlow is part of the AgileFlow project ecosystem.

## Support

For issues, questions, or suggestions, please refer to the main AgileFlow documentation.
