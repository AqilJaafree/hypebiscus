import Header from "@/components/header";
import Menu from "@/components/menu";
import { ReactNode } from "react";

interface PageTemplateProps {
  children: ReactNode;
}

const PageTemplate = ({ children }: PageTemplateProps) => {
  return (
    <div className="flex min-h-screen flex-col relative">
      <Header />
      <main className="w-full flex-1 lg:gap-4 relative lg:px-[70px] px-4">
        <div className="absolute top-0 left-4 lg:flex justify-center items-center h-full hidden">
          <Menu />
        </div>
        <div className="flex-1">
          {children}
        </div>
      </main>
    </div>
  );
};

export default PageTemplate;
