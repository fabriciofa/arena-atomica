FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    REACAO_DB=/data/reacao.sqlite3

WORKDIR /app
COPY server.py questions.json index.html style.css game.js arena.js ./
RUN mkdir /data && chown 10001:10001 /data

USER 10001:10001
EXPOSE 8000
STOPSIGNAL SIGINT

CMD ["python", "server.py"]
