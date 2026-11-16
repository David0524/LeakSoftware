import { faqFor } from "@/lib/faq";
import { Note } from "../kit";
import type { ChapterDef } from "../types";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/site";

/** The FAQ, from the same questions as sundeckpro.com/faq (src/lib/faq.ts). */
export const faq: ChapterDef = {
  id: "faq",
  title: "Questions shops ask",
  lede: "The questions owners and techs ask us most, answered in a sentence or three. The same answers are on sundeckpro.com/faq.",
  Body: ({ edition }) => (
    <>
      {faqFor(edition).map((topic) => (
        <section key={topic.id} className="m-faq-group">
          <h3 className="m-faq-group-title">{topic.title}</h3>
          {topic.items.map((item) => (
            <div key={item.q} className="m-faq-item">
              <p className="m-faq-q">{item.q}</p>
              <p className="m-faq-a">{item.a}</p>
            </div>
          ))}
        </section>
      ))}
      <Note title="Still have a question?">
        Write to {CONTACT_EMAIL} or call {CONTACT_PHONE}.
      </Note>
    </>
  ),
};
