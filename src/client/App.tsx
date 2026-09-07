import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Interview from "./routes/Interview";
import Landing from "./routes/Landing";
import Report from "./routes/Report";
import Scan from "./routes/Scan";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Landing />,
  },
  {
    path: "/interview/:id/scan",
    element: <Scan />,
  },
  {
    path: "/interview/:id",
    element: <Interview />,
  },
  {
    path: "/interview/:id/report",
    element: <Report />,
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
