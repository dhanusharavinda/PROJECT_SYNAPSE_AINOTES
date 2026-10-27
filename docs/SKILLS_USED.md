# Design guidance used

The user requested these sources on 27 October 2026. Code was adapted to the existing React notebook rather than running a separate wiki dashboard or replacing the application framework.

| Source | Revision reviewed | Applied guidance |
| --- | --- | --- |
| [Diagram Design](https://github.com/cathrynlavery/diagram-design) (MIT) | `97d795138448f6a739a0cebc3d9beb37a42077f1` | User chose the stock editorial palette. Semantic node shapes, orthogonal routes, bounded density, short labelled relationships, reviewable diagrams, local fonts, and transparent inline output. |
| [Understand Anything](https://github.com/Egonex-AI/Understand-Anything) (MIT) | `4e6d3299017a7432da15957874992837a315c5b4` | Focused exploration, topic outline, incoming/outgoing relationship explanations, prerequisite reading paths, and explicit graph freshness. Automatic inferred relationships were excluded to honor manual linking. |
| [Impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0) | `414603bf14c7a344edb466bb1f85690c77ce8b7d` | Operate/Read hierarchy, progressive disclosure, contextual controls, keyboard focus, contrast, responsive review, mechanical detector, independent finish review, and design documentation. |
| [Taste Skill](https://github.com/leonxlnx/taste-skill) (MIT) | `12af471f627f866411b4bd785b19646d3672784c` | App-screen guidance and framed-sheet direction, seed 76532073. Retained the user-confirmed sage palette and Inter/Lora type. Quiet navigation, real note data, no vanity statistics, no decorative page entrances. |

The diagram renderer and notebook graph model are application code, not a claim that every feature of those projects is embedded. Diagram previews use the requested stock Geist faces, separately from the notebook's existing typography. Fonts are bundled locally with their license notices. In-note SVG is the primary diagram output because the user explicitly requested transparent drawings between paragraphs.

Browser checks use the available CUA browser tooling rather than launching the skill's separate browser inspector. The static Taste lint and Impeccable detector were run. The detector's font warnings are retained deliberately because the user confirmed the incumbent typography and the diagram skill's stock style.
