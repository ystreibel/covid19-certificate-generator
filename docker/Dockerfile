FROM node:latest

ENV REASONS "sport_animaux"

ENV PROFILES_PATH "./profiles.json"

VOLUME ["/data"]

COPY entrypoint.sh /

ENV TZ=Europe/Paris

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone  && chmod +x /entrypoint.sh

WORKDIR /data

ENTRYPOINT [ "/entrypoint.sh" ]