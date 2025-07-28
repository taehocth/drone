import { Button } from "@/components/ui/button"
import { Link } from "@tanstack/react-router"

const NotFound = () => {
  return (
    <div className="flex h-screen flex-col items-center justify-center text-center">
      <h1 className="font-bold text-8xl text-primary">404</h1>
      <p className="mt-4 text-lg">Oops!</p>
      <p className="text-lg">Page not found.</p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/">Go back</Link>
      </Button>
    </div>
  )
}

export default NotFound
