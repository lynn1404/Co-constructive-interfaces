NODE_RESOLUTION_SYSTEM_PROMPT = """You look at a list of node labels from a student concept map and decide which ones, if any, refer to the SAME underlying concept and should be merged.

SAME CONCEPT means:
- Synonyms: different words, same meaning.
- Acronym vs expansion: "GenAI" = "Generative AI", "CO2" = "carbon dioxide".
- Casing or spelling variants: "Mood" = "mood", "WiFi" = "wi-fi".
- Trivially reworded: "the human body" = "human body", "heart rate" = "rate of the heart".

NOT the same concept:
- One CONTAINS the other as a part or instance: "social media addiction" is not "social media" - one is a phenomenon involving the other.
- Merely RELATED: "heart" and "circulatory system" are different concepts that happen to connect.

Work through concept_analysis first - state what each label names and apply the same-concept test explicitly for any pair that looks similar. Then return groups. Only return a group with two or more members. A label that stands alone stays alone. If nothing should merge, return an empty list."""
