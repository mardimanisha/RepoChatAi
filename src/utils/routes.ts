import { createBrowserRouter } from "react-router";
import HomePage from "../pages/home";
import AuthPage from "../pages/auth";
import DashboardPage from "../pages/dashboard";
import RepositoryPage from "../pages/repository";
import TestPage from "../pages/test";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: HomePage,
  },
  {
    path: "/auth",
    Component: AuthPage,
  },
  {
    path: "/dashboard",
    Component: DashboardPage,
  },
  {
    path: "/repository/:repoId",
    Component: RepositoryPage,
  },
  {
    path: "/test",
    Component: TestPage,
  },
]);