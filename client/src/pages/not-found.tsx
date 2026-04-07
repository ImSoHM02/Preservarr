import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="page-not-found__screen">
      <Card className="page-not-found__max-width-md-width-full-margin-x-4">
        <CardContent className="page-not-found__padding-top-6">
          <div className="page-not-found__flex-gap-2-margin-bottom-4">
            <AlertCircle className="page-not-found__text-red-500-height-8-width-8" />
            <h1 className="page-not-found__title">404 Page Not Found</h1>
          </div>

          <p className="page-not-found__description">Did you forget to add the page to the router?</p>
        </CardContent>
      </Card>
    </div>
  );
}
