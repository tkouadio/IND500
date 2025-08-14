# ---- Build stage ----
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

# ---- Runtime stage ----
FROM eclipse-temurin:17-jre
WORKDIR /app

# Jar
COPY --from=build /app/target/*.jar /app/app.jar

# Scripts TP2 (toujours inclus)
COPY scripts ./scripts

# Dump Postgres (inclus si présent dans le contexte)
# -> si dump/dump_tp1_orig.sql n'existe pas, cette instruction sera ignorée par Docker (aucun fichier trouvé)
#    on rend la commande robuste avec un shell intermédiaire
RUN mkdir -p /app/dump /app/data /app/artifacts && true
COPY dump/dump_tp1_orig.sql /app/dump/dump_tp1_orig.sql

# Métadonnées (optionnel)
LABEL org.opencontainers.image.title="tp2-harness" \
      org.opencontainers.image.description="TP2 Harness Java (Testcontainers) avec scripts et dump optionnel" \
      org.opencontainers.image.source="https://github.com/tkouadio/IND500"

# Variables utiles
ENV JAVA_TOOL_OPTIONS="-XX:+UseContainerSupport"

# Exécution
ENTRYPOINT ["java","-jar","/app/app.jar"]
