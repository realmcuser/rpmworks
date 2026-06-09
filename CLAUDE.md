# RPMWorks — Claude Code Instructions

## DB-migrationer — viktig regel

När en ny kolumn läggs till i `backend/models.py` **måste** motsvarande rad också läggas till i startup-migrationsblocket i `backend/main.py` (runt rad 22):

```python
_conn.execute(text("ALTER TABLE <tabell> ADD COLUMN IF NOT EXISTS <kolumn> <typ> <default>"))
```

Produktionsservern kör som systemd-service installerad via RPM. Det finns inget manuellt migreringssteg — `systemctl restart rpmworks` efter RPM-uppgradering är det enda som körs. Saknas raden i `main.py` kraschar servicen med `UndefinedColumn` vid första anropet.

## Manual/dokumentation

Uppdatera Wiki.js-manualen med:

```bash
source /root/wikijs-data/.env
python3 /root/wikijs-data/wikijs-cli.py get Utveckling/Johan/Projekt/Rpmworks
python3 /root/wikijs-data/wikijs-cli.py put Utveckling/Johan/Projekt/Rpmworks manual.md
```
