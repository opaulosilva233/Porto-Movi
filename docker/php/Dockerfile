FROM php:8.3-fpm-alpine

# Arguments defined in docker-compose.yml or defaults
ARG USER=laravel
ARG UID=1000

# Install system dependencies and build dependencies
RUN apk add --no-cache \
    git \
    curl \
    libpng-dev \
    libxml2-dev \
    zip \
    unzip \
    oniguruma-dev \
    libzip-dev \
    linux-headers \
    freetype-dev \
    libjpeg-turbo-dev \
    shadow \
    bash \
    $PHPIZE_DEPS

# Configure and install PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
        pdo \
        pdo_mysql \
        mbstring \
        exif \
        pcntl \
        bcmath \
        gd \
        zip \
        opcache

# Clean apk cache and temp build deps
RUN rm -rf /var/cache/apk/*

# Install Composer from official image (pinned version 2.8)
COPY --from=composer:2.8 /usr/bin/composer /usr/bin/composer

# Create non-root system user to run Composer and Artisan Commands
RUN useradd -G www-data,root -u ${UID} -d /home/${USER} ${USER} \
    && mkdir -p /home/${USER}/.composer \
    && chown -R ${USER}:${USER} /home/${USER}

# Set working directory
WORKDIR /var/www/backend

# Switch to non-root user
USER ${USER}

EXPOSE 9000

CMD ["php-fpm"]
