import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Landing from "./routes/Landing";
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
]);

export default function App() {
  return <RouterProvider router={router} />;
}
