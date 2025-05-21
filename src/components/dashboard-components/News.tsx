"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Newspaper } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

interface NewsItem {
  id: number;
  title: string;
  time: string;
  isNew: boolean;
}

export default function News() {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);

  // Close the news panel when switching to desktop
  useEffect(() => {
    if (!isMobile) {
      setIsOpen(false);
    }
  }, [isMobile]);

  const newsItems: NewsItem[] = [
    {
      id: 1,
      title: "Grayscale BTC Trust Reaches $89M Worth of BTC",
      time: "3 hours ago",
      isNew: true,
    },
    {
      id: 2,
      title:
        "El Salvador Committed to Buying Bitcoin Every Day, Says President",
      time: "5 hours ago",
      isNew: true,
    },
    {
      id: 3,
      title:
        "Binance Launches $100M Liquidity Fund for Asian Crypto-Enabled Companies",
      time: "10 hours ago",
      isNew: true,
    },
    {
      id: 4,
      title:
        "Bitcoin Surpasses $70K Milestone Once Again with $1T Market Value",
      time: "12 hours ago",
      isNew: true,
    },
    {
      id: 5,
      title:
        "Global Crypto Market Capitalization Surpasses $2.5 Trillion, BTC Leads",
      time: "1 day ago",
      isNew: false,
    },
  ];

  if (isMobile) {
    return (
      <>
        {/* News toggle button for mobile */}
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-28 right-4 z-20 rounded-full bg-primary hover:bg-primary/80 shadow-lg md:bottom-28"
          onClick={() => setIsOpen(true)}
        >
          <Newspaper className="h-5 w-5" />
        </Button>

        {/* News panel for mobile */}
        <div
          className={`fixed inset-0 z-30 bg-black/50 transition-opacity duration-300 ${
            isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          onClick={() => setIsOpen(false)}
        />

        <div
          className={`fixed top-0 right-0 bottom-0 z-40 w-[280px] bg-background border-l border-primary/30 p-4 transition-transform duration-300 ease-in-out ${
            isOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold">News</h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-white text-sm mb-4">
            Read latest news about Bitcoin
          </p>
          <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-80px)]">
            {newsItems.map((item) => (
              <div key={item.id}>
                <div className="flex items-start">
                  <span className="text-primary bg-secondary rounded-[4px] p-2 w-5 h-5 flex items-center justify-center mr-3">
                    {item.id}
                  </span>
                  <div className="flex flex-col items-start">
                    <p className="text-white text-sm">{item.title}</p>
                    <span className="text-sub-text text-nowrap">
                      {item.time}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  // Desktop version
  return (
    <div>
      <Card className="relative overflow-hidden">
        {/* Radial blur effect in top right corner */}
        <div className="absolute -top-4 -right-4 w-[300px] h-[200px] opacity-30 pointer-events-none">
          <div className="absolute -top-4 -right-4 w-[200px] h-[200px] rounded-full bg-primary blur-[60px]"></div>
        </div>

        <div className="z-10">
          <CardHeader>
            <CardTitle>News</CardTitle>
          </CardHeader>
          <CardDescription>
            <p>Read latest news about Bitcoin</p>
          </CardDescription>
          <CardContent className="flex flex-col gap-4">
            {newsItems.map((item) => (
              <p className="flex items-start text-white text-sm" key={item.id}>
                <span className="text-primary bg-secondary rounded-[4px] p-2 w-5 h-5 flex items-center justify-center mr-3">
                  {item.id}
                </span>
                {item.title}
                <span className="ml-2 text-sub-text text-nowrap">
                  {item.time}
                </span>
              </p>
            ))}
          </CardContent>
        </div>
      </Card>
    </div>
  );
}

// "use client";

// import {
//   Card,
//   CardContent,
//   CardHeader,
//   CardTitle,
//   CardDescription,
// } from "@/components/ui/card";

// const News = () => {
//   return (
//     <div>
//       <Card className="relative overflow-hidden">
//         {/* Radial blur effect in top right corner */}
//         <div className="absolute -top-4 -right-4 w-[300px] h-[200px] opacity-30 pointer-events-none">
//           <div className="absolute -top-4 -right-4 w-[200px] h-[200px] rounded-full bg-primary blur-[60px]"></div>
//         </div>

//         <CardHeader>
//           <CardTitle>News</CardTitle>
//         </CardHeader>
//         <CardDescription>
//           <p>Read latest news about Bitcoin</p>
//         </CardDescription>
//         <CardContent className="flex flex-col gap-4">
//           <p className="flex items-start text-white text-sm">
//             <span className="text-primary bg-secondary rounded-sm p-2 w-5 h-5 flex items-center justify-center mr-3">
//               1
//             </span>
//             Grayscale BTC Trust Transfers $911M Worth of BTC
//             <span className="ml-2 text-sub-text text-nowrap">1 hour ago</span>
//           </p>
//           <p className="flex items-start text-white text-sm">
//             <span className="text-primary bg-secondary rounded-sm p-2 w-5 h-5 flex items-center justify-center mr-3">
//               2
//             </span>
//             El Salvador Committed to Buying Bitcoin Despite IMF Deal, Minister
//             Says
//             <span className="ml-2 text-sub-text text-nowrap">1 hour ago</span>
//           </p>
//           <p className="flex items-start text-white text-sm">
//             <span className="text-primary bg-secondary rounded-sm p-2 w-5 h-5 flex items-center justify-center mr-3">
//               3
//             </span>
//             Bitcoin Seoul 2025 to Host Global Industry Leaders for Asia&apos;s
//             Largest Bitcoin-Focused Conference
//             <span className="ml-2 text-sub-text text-nowrap">1 hour ago</span>
//           </p>
//           <p className="flex items-start text-white text-sm">
//             <span className="text-primary bg-secondary rounded-sm p-2 w-5 h-5 flex items-center justify-center mr-3">
//               4
//             </span>
//             Bitcoin ETFs Hit Eighth Day of Successive Gains With $173 Million
//             Inflow
//             <span className="ml-2 text-sub-text text-nowrap">1 hour ago</span>
//           </p>
//           <p className="flex items-start text-white text-sm">
//             <span className="text-primary bg-secondary rounded-sm p-2 w-5 h-5 flex items-center justify-center mr-3">
//               5
//             </span>
//             Bitcoin Price Watch: Consolidation Tightens—Is a Surge to $98K Next?
//             <span className="ml-2 text-sub-text text-nowrap">1 hour ago</span>
//           </p>
//         </CardContent>
//       </Card>
//     </div>
//   );
// };
