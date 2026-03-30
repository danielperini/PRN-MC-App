import React, { createContext, useState, useContext } from 'react';

const PatrocinadorViewContext = createContext();

export const PatrocinadorViewProvider = ({ children }) => {
  const [isPatrocinadorView, setIsPatrocinadorView] = useState(false);

  return (
    <PatrocinadorViewContext.Provider value={{ isPatrocinadorView, setIsPatrocinadorView }}>
      {children}
    </PatrocinadorViewContext.Provider>
  );
};

export const usePatrocinadorView = () => {
  const context = useContext(PatrocinadorViewContext);
  if (!context) {
    throw new Error('usePatrocinadorView must be used within PatrocinadorViewProvider');
  }
  return context;
};