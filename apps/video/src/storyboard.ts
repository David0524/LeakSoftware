// The two storyboards (docs/plans/demo-videos.md sections 2 and 3), timed to the music's bars.
// Beat times are seconds from the start of their scene (each scene is 3 bars, 5.625 s).

export type Device = "desktop" | "phone" | "customer";

export type Beat = {
  at: number;
  on: Device;
  text: string;
  /** A tap: the blue ring shows a beat before the screen reacts. */
  tap?: boolean;
  tone?: "fail" | "pass";
};

export type Scene = {
  title: string;
  caption: string;
  devices: Device[];
  beats: Beat[];
  /** A photo or shop logo shown in a device, from assets/. */
  image?: { on: Device; at: number; src: string; kind: "photo" | "logo" };
};

export type Video = {
  id: "Leak" | "Pool";
  track: string;
  opener: string;
  tagline: string;
  scenes: [Scene, Scene, Scene, Scene, Scene, Scene];
};

export const leak: Video = {
  id: "Leak",
  track: "generated/leak.wav",
  opener: "For leak detection shops",
  tagline: "Find it. Prove it. Get paid.",
  scenes: [
    {
      title: "Book and route",
      caption: "Book it. Optimize the route.",
      devices: ["desktop"],
      beats: [
        { at: 0.5, on: "desktop", text: "Schedule › Week" },
        { at: 1.4, on: "desktop", text: "New leak detection on Tuesday · Dana and Jake" },
        { at: 2.6, on: "desktop", text: "Optimize", tap: true },
        { at: 3.6, on: "desktop", text: "−42 min driving", tone: "pass" },
      ],
    },
    {
      title: "On the way",
      caption: "Your tech's day, on the Lock Screen",
      devices: ["phone"],
      beats: [
        { at: 0.5, on: "phone", text: "Today · Rebecca Soto, 9:30" },
        { at: 1.6, on: "phone", text: "On My Way", tap: true },
        { at: 2.8, on: "phone", text: "Live Activity: On the way · 18 min" },
      ],
    },
    {
      title: "The test",
      caption: "Every test, every finding, recorded",
      devices: ["phone"],
      beats: [
        { at: 0.4, on: "phone", text: "Pressure test · return line" },
        { at: 1.3, on: "phone", text: "Dropped", tone: "fail" },
        { at: 2.2, on: "phone", text: "Dye test · light niche" },
        { at: 3.0, on: "phone", text: "Pin the finding on the pool diagram", tap: true },
      ],
      image: { on: "phone", at: 3.8, src: "photos/leak-dye-light-niche.jpg", kind: "photo" },
    },
    {
      title: "Report and quote",
      caption: "A clear report. A quote on the spot.",
      devices: ["desktop", "phone"],
      beats: [
        { at: 0.5, on: "desktop", text: "Homeowner report, page by page" },
        { at: 1.8, on: "phone", text: "Send Report", tap: true },
        { at: 2.8, on: "phone", text: "Repair quote · 3 line items · $1,840" },
        { at: 3.9, on: "phone", text: "Send Quote", tap: true },
      ],
      image: { on: "desktop", at: 0.5, src: "shops/canyon-state-logo.png", kind: "logo" },
    },
    {
      title: "Customer pays",
      caption: "Accepted and paid before you leave",
      devices: ["desktop", "customer"],
      beats: [
        { at: 0.5, on: "customer", text: "Rebecca's quote" },
        { at: 1.4, on: "customer", text: "Accept Quote", tap: true },
        { at: 2.4, on: "customer", text: "Deposit by card · receipt" },
        { at: 3.5, on: "desktop", text: "Activity: Deposit paid · $920", tone: "pass" },
      ],
    },
    {
      title: "The owner's view",
      caption: "See the whole business at a glance",
      devices: ["desktop"],
      beats: [
        { at: 0.5, on: "desktop", text: "Dashboard · Marcus Hale" },
        { at: 1.4, on: "desktop", text: "Collected · Owed to you · Quotes accepted" },
        { at: 2.8, on: "desktop", text: "Activity", tap: true },
        { at: 3.6, on: "desktop", text: "The day's events" },
      ],
    },
  ],
};

export const pool: Video = {
  id: "Pool",
  track: "generated/pool.wav",
  opener: "For pool service companies",
  tagline: "Every pool. Every week. On autopilot.",
  scenes: [
    {
      title: "Plans and routes",
      caption: "Weekly routes that build themselves",
      devices: ["desktop"],
      beats: [
        { at: 0.5, on: "desktop", text: "Week · 50 weekly plans fill the rows" },
        { at: 1.4, on: "desktop", text: "Luis, Priya and Tony in their colors" },
        { at: 2.6, on: "desktop", text: "Optimize Week", tap: true },
        { at: 3.6, on: "desktop", text: "Five day maps redraw" },
      ],
    },
    {
      title: "The day",
      caption: "12 stops. One tap to the next.",
      devices: ["phone"],
      beats: [
        { at: 0.5, on: "phone", text: "Today · 12 stops · from home" },
        { at: 1.6, on: "phone", text: "Next stop", tap: true },
        { at: 2.8, on: "phone", text: "Live Activity: Stop 3 of 12 · Then: Megan Price" },
      ],
    },
    {
      title: "The visit",
      caption: "Readings in. What to add, worked out.",
      devices: ["phone"],
      beats: [
        { at: 0.4, on: "phone", text: "Chlorine 1.0 · pH 7.9" },
        { at: 1.4, on: "phone", text: "Add 2 lb shock · 12 oz acid", tone: "pass" },
        { at: 2.4, on: "phone", text: "Filter cleaning due today" },
        { at: 3.3, on: "phone", text: "Before and after photos", tap: true },
      ],
      image: { on: "phone", at: 3.8, src: "photos/pool-after.jpg", kind: "photo" },
    },
    {
      title: "The homeowner hears",
      caption: "Customers see the work, automatically",
      devices: ["phone", "customer"],
      beats: [
        { at: 0.5, on: "phone", text: "Mark Complete", tap: true },
        { at: 1.6, on: "customer", text: "Visit report by text and email" },
        { at: 2.6, on: "customer", text: "Photos and readings" },
      ],
      image: { on: "customer", at: 2.6, src: "photos/pool-after.jpg", kind: "photo" },
    },
    {
      title: "The upsell",
      caption: "Spot a repair. Quote it on site.",
      devices: ["phone", "customer"],
      beats: [
        { at: 0.5, on: "phone", text: "Finding: pump noise" },
        { at: 1.6, on: "phone", text: "Repair quote · new pump · $1,150", tap: true },
        { at: 3.0, on: "customer", text: "Accept Quote", tap: true },
      ],
      image: { on: "phone", at: 0.9, src: "photos/equipment-pad.jpg", kind: "photo" },
    },
    {
      title: "Billing and the owner",
      caption: "Invoices out. Payments in.",
      devices: ["desktop"],
      beats: [
        { at: 0.5, on: "desktop", text: "Monthly invoices for every plan" },
        { at: 1.6, on: "desktop", text: "Paid by card · 46 of 50", tone: "pass" },
        { at: 2.7, on: "desktop", text: "Dashboard · Erin Cole" },
        { at: 3.6, on: "desktop", text: "Activity", tap: true },
      ],
      image: { on: "desktop", at: 0.5, src: "shops/blue-mesa-logo.png", kind: "logo" },
    },
  ],
};
