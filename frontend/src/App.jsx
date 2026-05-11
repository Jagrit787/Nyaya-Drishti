import React, { useContext } from "react";
import { Context } from "./context/Context";
import Login from "./components/Login/Login";
import Sidebar from "./components/Sidebar/Sidebar";
import Main from "./components/Main/Main";

const App = () => {
  const { user } = useContext(Context);

  if (!user) return <Login />;

  return (
    <>
      <Sidebar />
      <Main />
    </>
  );
};

export default App;
