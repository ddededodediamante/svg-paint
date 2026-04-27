import { render } from "preact";
import "./app.css";
import App from "./lib/App";

const app = document.getElementById("app");
if (app) {
  render(<App />, app);
}