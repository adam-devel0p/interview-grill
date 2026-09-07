import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Landing from "./routes/Landing";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Landing />,
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
