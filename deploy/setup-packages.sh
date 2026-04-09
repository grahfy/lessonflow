#!/bin/bash
# =============================================================================
# LessonFlow - Package Installation Script
# =============================================================================
# Automatically detects OS and installs required packages:
#   - Node.js 20.19+ LTS (or 22.12+ / 24+)
#   - MySQL/MariaDB
#   - Nginx
#   - Certbot (for SSL)
#   - Build tools (gcc, make, python3 for native npm modules)
#
# Supported OS families:
#   - Debian/Ubuntu (apt)
#   - RHEL/CentOS/Fedora/Rocky/Alma (dnf/yum)
#   - openSUSE (zypper)
#   - Arch Linux (pacman)
#
# Usage:
#   sudo ./deploy/setup-packages.sh [options]
#
# Options:
#   --skip-node       Skip Node.js installation
#   --skip-db         Skip database installation
#   --skip-nginx      Skip Nginx installation
#   --skip-certbot    Skip Certbot installation
#   --dry-run         Show what would be installed without installing
#   --non-interactive Run without prompts (use defaults)
#
# Requirements:
#   - Root or sudo access
#   - Internet connection
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
SKIP_NODE=false
SKIP_DB=false
SKIP_NGINX=false
SKIP_CERTBOT=false
DRY_RUN=false
NON_INTERACTIVE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-node)
            SKIP_NODE=true
            shift
            ;;
        --skip-db)
            SKIP_DB=true
            shift
            ;;
        --skip-nginx)
            SKIP_NGINX=true
            shift
            ;;
        --skip-certbot)
            SKIP_CERTBOT=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --non-interactive)
            NON_INTERACTIVE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-node       Skip Node.js installation"
            echo "  --skip-db         Skip database installation"
            echo "  --skip-nginx      Skip Nginx installation"
            echo "  --skip-certbot    Skip Certbot installation"
            echo "  --dry-run         Show what would be installed"
            echo "  --non-interactive Run without prompts"
            echo "  --help, -h        Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}==>${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

# =============================================================================
# OS DETECTION
# =============================================================================
detect_os() {
    log_step "Detecting operating system..."
    
    # Check for /etc/os-release (standard on modern systems)
    if [[ -f /etc/os-release ]]; then
        source /etc/os-release
        
        case "$ID" in
            ubuntu|debian|linuxmint|pop|elementary)
                OS_FAMILY="debian"
                OS_NAME="$NAME"
                OS_VERSION="$VERSION_ID"
                PKG_MANAGER="apt"
                ;;
            rhel|centos|fedora|rocky|almalinux|ol|scientific)
                OS_FAMILY="rhel"
                OS_NAME="$NAME"
                OS_VERSION="${VERSION_ID:-7}"
                if command -v dnf &> /dev/null; then
                    PKG_MANAGER="dnf"
                else
                    PKG_MANAGER="yum"
                fi
                ;;
            opensuse*|sles|suse)
                OS_FAMILY="suse"
                OS_NAME="$NAME"
                OS_VERSION="${VERSION_ID:-15}"
                PKG_MANAGER="zypper"
                ;;
            arch|manjaro|endeavouros|garuda)
                OS_FAMILY="arch"
                OS_NAME="$NAME"
                OS_VERSION="rolling"
                PKG_MANAGER="pacman"
                ;;
            *)
                log_error "Unsupported OS: $ID"
                log_error "Supported: Debian/Ubuntu, RHEL/CentOS/Fedora/Rocky/Alma, openSUSE, Arch"
                exit 1
                ;;
        esac
    elif [[ -f /etc/redhat-release ]]; then
        OS_FAMILY="rhel"
        OS_NAME=$(cat /etc/redhat-release)
        OS_VERSION=$(echo "$OS_NAME" | grep -oE '[0-9]+' | head -1)
        PKG_MANAGER="yum"
    elif [[ -f /etc/arch-release ]]; then
        OS_FAMILY="arch"
        OS_NAME="Arch Linux"
        OS_VERSION="rolling"
        PKG_MANAGER="pacman"
    elif [[ -f /etc/SuSE-release ]]; then
        OS_FAMILY="suse"
        OS_NAME="openSUSE"
        OS_VERSION=$(grep VERSION /etc/SuSE-release | cut -d'=' -f2 | tr -d ' ')
        PKG_MANAGER="zypper"
    else
        log_error "Cannot detect operating system"
        log_error "Supported: Debian/Ubuntu, RHEL/CentOS/Fedora/Rocky/Alma, openSUSE, Arch"
        exit 1
    fi
    
    log_info "Detected: ${OS_NAME} (${OS_FAMILY} family)"
    log_info "Package manager: ${PKG_MANAGER}"
}

# =============================================================================
# PACKAGE INSTALLATION FUNCTIONS
# =============================================================================

# Run a command (or print it in dry-run mode).
# Centralizing this wrapper keeps the install functions readable while ensuring
# every mutating command respects the same dry-run semantics.
run_cmd() {
    if [[ "$DRY_RUN" == true ]]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} $*"
    else
        "$@"
    fi
}

# Update package lists
update_packages() {
    log_step "Updating package lists..."
    
    case "$PKG_MANAGER" in
        apt)
            run_cmd apt update
            ;;
        dnf|yum)
            run_cmd $PKG_MANAGER makecache -y
            ;;
        zypper)
            run_cmd zypper refresh
            ;;
        pacman)
            run_cmd pacman -Sy
            ;;
    esac
}

# Install packages using the detected package manager abstraction.
# Package names are resolved by the caller (per OS family), while this function
# only handles the package-manager-specific invocation syntax.
install_packages() {
    local packages=("$@")
    
    if [[ ${#packages[@]} -eq 0 ]]; then
        return
    fi
    
    log_info "Installing: ${packages[*]}"
    
    case "$PKG_MANAGER" in
        apt)
            run_cmd apt install -y "${packages[@]}"
            ;;
        dnf)
            run_cmd dnf install -y "${packages[@]}"
            ;;
        yum)
            run_cmd yum install -y "${packages[@]}"
            ;;
        zypper)
            run_cmd zypper install -y "${packages[@]}"
            ;;
        pacman)
            run_cmd pacman -S --noconfirm "${packages[@]}"
            ;;
    esac
}

# =============================================================================
# NODE.JS INSTALLATION
# =============================================================================
install_nodejs() {
    if [[ "$SKIP_NODE" == true ]]; then
        log_info "Skipping Node.js installation (--skip-node)"
        return
    fi
    
    # Check if a Prisma 7-compatible Node.js runtime is already installed.
    # Prisma 7.7 requires Node.js 20.19+, 22.12+, or 24+.
    if command -v node &> /dev/null; then
        local node_major
        local node_minor
        node_major=$(node -p "process.versions.node.split('.')[0]")
        node_minor=$(node -p "process.versions.node.split('.')[1]")
        if [[ "${node_major}" -ge 24 ]] \
            || [[ "${node_major}" -eq 22 && "${node_minor}" -ge 12 ]] \
            || [[ "${node_major}" -eq 20 && "${node_minor}" -ge 19 ]]; then
            log_info "Node.js $(node -v) already installed (Prisma-compatible version)"
            return
        else
            log_warn "Node.js $(node -v) installed but below Prisma 7.7 minimum, upgrading..."
        fi
    fi
    
    log_step "Installing Node.js 20 LTS (20.19+ baseline)..."
    
    case "$OS_FAMILY" in
        debian)
            # Use NodeSource for Debian/Ubuntu
            log_info "Adding NodeSource repository..."
            if [[ "$DRY_RUN" == false ]]; then
                curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            else
                echo -e "${YELLOW}[DRY-RUN]${NC} curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
            fi
            install_packages nodejs
            ;;
            
        rhel)
            # Use NodeSource for RHEL/CentOS/Fedora
            log_info "Adding NodeSource repository..."
            if [[ "$DRY_RUN" == false ]]; then
                curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
            else
                echo -e "${YELLOW}[DRY-RUN]${NC} curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -"
            fi
            install_packages nodejs
            ;;
            
        suse)
            # openSUSE has Node.js in repos
            install_packages nodejs20 nodejs20-npm
            # Create symlink if needed
            if [[ "$DRY_RUN" == false ]]; then
                command -v node &> /dev/null || ln -sf /usr/bin/node20 /usr/bin/node
                command -v npm &> /dev/null || ln -sf /usr/bin/npm20 /usr/bin/npm
            fi
            ;;
            
        arch)
            # Arch always has latest Node.js
            install_packages nodejs npm
            ;;
    esac
    
    # Verify installation
    if [[ "$DRY_RUN" == false ]]; then
        log_info "Node.js version: $(node -v)"
        log_info "npm version: $(npm -v)"
    fi
}

# =============================================================================
# DATABASE INSTALLATION
# =============================================================================
# Installs a local MySQL/MariaDB server for self-hosted VPS deployments. This is
# a convenience bootstrap script; managed DB users can pass --skip-db.
install_database() {
    if [[ "$SKIP_DB" == true ]]; then
        log_info "Skipping database installation (--skip-db)"
        return
    fi
    
    # Check if MySQL/MariaDB is already installed
    if command -v mysql &> /dev/null; then
        log_info "MySQL/MariaDB already installed: $(mysql --version)"
        return
    fi
    
    log_step "Installing MySQL/MariaDB..."
    
    case "$OS_FAMILY" in
        debian)
            # Ubuntu/Debian: MySQL or MariaDB
            if [[ "$NON_INTERACTIVE" == true ]]; then
                # Temporary root password is only for unattended package install;
                # the summary still instructs operators to run mysql_secure_installation.
                # Pre-configure MySQL root password for non-interactive install
                run_cmd debconf-set-selections <<< "mysql-server mysql-server/root_password password temp_password"
                run_cmd debconf-set-selections <<< "mysql-server mysql-server/root_password_again password temp_password"
                install_packages mysql-server
            else
                install_packages mysql-server
            fi
            ;;
            
        rhel)
            if [[ "$ID" == "fedora" ]]; then
                install_packages mysql-server
            else
                # RHEL/CentOS/Rocky/Alma use MariaDB
                install_packages mariadb-server mariadb
            fi
            run_cmd systemctl enable mariadb 2>/dev/null || run_cmd systemctl enable mysqld 2>/dev/null || true
            run_cmd systemctl start mariadb 2>/dev/null || run_cmd systemctl start mysqld 2>/dev/null || true
            ;;
            
        suse)
            install_packages mariadb mariadb-tools
            run_cmd systemctl enable mysql || true
            run_cmd systemctl start mysql || true
            ;;
            
        arch)
            install_packages mariadb
            if [[ "$DRY_RUN" == false ]]; then
                run_cmd mariadb-install-db --user=mysql --basedir=/usr --datadir=/var/lib/mysql
                run_cmd systemctl enable mariadb
                run_cmd systemctl start mariadb
            fi
            ;;
    esac
    
    log_info "Database installed. Run 'mysql_secure_installation' to secure it."
}

# =============================================================================
# NGINX INSTALLATION
# =============================================================================
install_nginx() {
    if [[ "$SKIP_NGINX" == true ]]; then
        log_info "Skipping Nginx installation (--skip-nginx)"
        return
    fi
    
    # Check if Nginx is already installed
    if command -v nginx &> /dev/null; then
        log_info "Nginx already installed: $(nginx -v 2>&1)"
        return
    fi
    
    log_step "Installing Nginx..."
    
    case "$OS_FAMILY" in
        debian)
            install_packages nginx
            ;;
            
        rhel)
            install_packages nginx
            run_cmd systemctl enable nginx || true
            run_cmd systemctl start nginx || true
            ;;
            
        suse)
            install_packages nginx
            run_cmd systemctl enable nginx || true
            run_cmd systemctl start nginx || true
            ;;
            
        arch)
            install_packages nginx
            run_cmd systemctl enable nginx || true
            run_cmd systemctl start nginx || true
            ;;
    esac
    
    log_info "Nginx installed and started"
}

# =============================================================================
# CERTBOT INSTALLATION
# =============================================================================
install_certbot() {
    if [[ "$SKIP_CERTBOT" == true ]]; then
        log_info "Skipping Certbot installation (--skip-certbot)"
        return
    fi
    
    # Check if Certbot is already installed
    if command -v certbot &> /dev/null; then
        log_info "Certbot already installed: $(certbot --version)"
        return
    fi
    
    log_step "Installing Certbot..."
    
    case "$OS_FAMILY" in
        debian)
            install_packages certbot python3-certbot-nginx
            ;;
            
        rhel)
            if [[ "$ID" == "fedora" ]]; then
                install_packages certbot python3-certbot-nginx
            else
                # Enable EPEL for RHEL/CentOS/Rocky/Alma
                install_packages epel-release
                install_packages certbot python3-certbot-nginx
            fi
            ;;
            
        suse)
            install_packages certbot python3-certbot-nginx
            ;;
            
        arch)
            install_packages certbot certbot-nginx
            ;;
    esac
    
    log_info "Certbot installed"
}

# =============================================================================
# BUILD TOOLS INSTALLATION
# =============================================================================
install_build_tools() {
    log_step "Installing build tools (required for native npm modules)..."
    
    case "$OS_FAMILY" in
        debian)
            install_packages build-essential python3 python3-pip
            ;;
            
        rhel)
            if [[ "$PKG_MANAGER" == "dnf" ]]; then
                run_cmd dnf group install -y "Development Tools" 2>/dev/null || \
                    install_packages gcc gcc-c++ make python3
            else
                run_cmd yum groupinstall -y "Development Tools" 2>/dev/null || \
                    install_packages gcc gcc-c++ make python3
            fi
            ;;
            
        suse)
            install_packages --type pattern devel_basis
            install_packages python3
            ;;
            
        arch)
            install_packages base-devel python
            ;;
    esac
}

# =============================================================================
# FIREWALL CONFIGURATION
# =============================================================================
# Opens only SSH + HTTP(S) defaults expected by Nginx/certbot. Activation is
# intentionally explicit on some platforms so operators can review rules first.
configure_firewall() {
    log_step "Configuring firewall..."
    
    case "$OS_FAMILY" in
        debian)
            if command -v ufw &> /dev/null; then
                run_cmd ufw allow ssh
                run_cmd ufw allow 'Nginx Full'
                log_info "Firewall configured with UFW. Run 'ufw enable' to activate."
            else
                install_packages ufw
                run_cmd ufw allow ssh
                run_cmd ufw allow 'Nginx Full'
                log_info "Firewall configured with UFW. Run 'ufw enable' to activate."
            fi
            ;;
            
        rhel)
            if command -v firewall-cmd &> /dev/null; then
                run_cmd systemctl enable firewalld || true
                run_cmd systemctl start firewalld || true
                run_cmd firewall-cmd --permanent --add-service=ssh
                run_cmd firewall-cmd --permanent --add-service=http
                run_cmd firewall-cmd --permanent --add-service=https
                run_cmd firewall-cmd --reload
                log_info "Firewall configured with firewalld"
            else
                install_packages firewalld
                run_cmd systemctl enable firewalld || true
                run_cmd systemctl start firewalld || true
                run_cmd firewall-cmd --permanent --add-service=ssh
                run_cmd firewall-cmd --permanent --add-service=http
                run_cmd firewall-cmd --permanent --add-service=https
                run_cmd firewall-cmd --reload
                log_info "Firewall configured with firewalld"
            fi
            ;;
            
        suse)
            if command -v firewall-cmd &> /dev/null; then
                run_cmd systemctl enable firewalld || true
                run_cmd systemctl start firewalld || true
                run_cmd firewall-cmd --permanent --add-service=ssh
                run_cmd firewall-cmd --permanent --add-service=http
                run_cmd firewall-cmd --permanent --add-service=https
                run_cmd firewall-cmd --reload
                log_info "Firewall configured with firewalld"
            fi
            ;;
            
        arch)
            if command -v ufw &> /dev/null; then
                run_cmd systemctl enable ufw || true
                run_cmd ufw allow ssh
                run_cmd ufw allow 'Nginx Full'
                log_info "Firewall configured with UFW. Run 'ufw enable' to activate."
            else
                log_warn "No firewall detected. Consider installing ufw: pacman -S ufw"
            fi
            ;;
    esac
}

# =============================================================================
# CREATE APPLICATION USER AND DIRECTORIES
# =============================================================================
create_app_user() {
    log_step "Creating application user and directories..."
    
    # Create www-data user if it doesn't exist (common on Debian)
    if ! id "www-data" &>/dev/null; then
        case "$OS_FAMILY" in
            debian)
                run_cmd useradd -r -s /bin/false -d /var/www www-data
                ;;
            rhel|suse|arch)
                run_cmd useradd -r -s /sbin/nologin -d /var/www www-data
                ;;
        esac
    fi
    
    # Create Capistrano-style release/shared directories used by deploy.sh.
    run_cmd mkdir -p /var/www/lessonflow/{releases,shared,data}
    run_cmd chown -R www-data:www-data /var/www/lessonflow
    
    log_info "Application directories created at /var/www/lessonflow"
}

# =============================================================================
# SUMMARY
# =============================================================================
print_summary() {
    echo ""
    echo "=========================================="
    echo "  Installation Summary"
    echo "=========================================="
    echo ""
    echo "OS:             ${OS_NAME}"
    echo "OS Family:      ${OS_FAMILY}"
    echo "Package Manager: ${PKG_MANAGER}"
    echo ""
    echo "Installed Components:"
    [[ "$SKIP_NODE" != true ]] && echo "  [x] Node.js 20.19+ LTS"
    [[ "$SKIP_NODE" == true ]] && echo "  [ ] Node.js 20.19+ LTS (skipped)"
    [[ "$SKIP_DB" != true ]] && echo "  [x] MySQL/MariaDB"
    [[ "$SKIP_DB" == true ]] && echo "  [ ] MySQL/MariaDB (skipped)"
    [[ "$SKIP_NGINX" != true ]] && echo "  [x] Nginx"
    [[ "$SKIP_NGINX" == true ]] && echo "  [ ] Nginx (skipped)"
    [[ "$SKIP_CERTBOT" != true ]] && echo "  [x] Certbot"
    [[ "$SKIP_CERTBOT" == true ]] && echo "  [ ] Certbot (skipped)"
    echo "  [x] Build tools"
    echo "  [x] Firewall configured"
    echo "  [x] Application user (www-data)"
    echo "  [x] Directory structure"
    echo ""
    echo "=========================================="
    echo "  Next Steps"
    echo "=========================================="
    echo ""
    echo "1. Secure the database:"
    echo "   sudo mysql_secure_installation"
    echo ""
    echo "2. Create database and user:"
    echo "   sudo mysql"
    echo "   CREATE DATABASE lessonflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    echo "   CREATE USER 'mgs_user'@'localhost' IDENTIFIED BY 'your-password';"
    echo "   GRANT ALL PRIVILEGES ON lessonflow.* TO 'mgs_user'@'localhost';"
    echo "   FLUSH PRIVILEGES;"
    echo ""
    echo "3. Create environment file:"
    echo "   sudo nano /var/www/lessonflow/shared/.env"
    echo ""
    echo "4. Deploy the application:"
    echo "   sudo ./deploy/deploy.sh --branch main"
    echo ""
    echo "5. Setup SSL certificate:"
    echo "   sudo ./deploy/setup-ssl.sh --email your@email.com"
    echo ""
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    echo ""
    echo "=========================================="
    echo "  LessonFlow"
    echo "  VPS Package Installer"
    echo "=========================================="
    echo ""
    
    if [[ "$DRY_RUN" == true ]]; then
        log_warn "DRY RUN MODE - No changes will be made"
        echo ""
    fi
    
    # Detect OS
    detect_os
    
    # Confirm before proceeding (unless non-interactive)
    if [[ "$NON_INTERACTIVE" != true && "$DRY_RUN" != true ]]; then
        echo ""
        read -p "Continue with installation? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Installation cancelled"
            exit 0
        fi
    fi
    
    # Update package lists first so later installs use current metadata.
    update_packages
    
    # Install components in dependency order: runtime, DB, proxy, SSL tooling,
    # then build/tooling and host-level prerequisites.
    install_nodejs
    install_database
    install_nginx
    install_certbot
    install_build_tools
    configure_firewall
    create_app_user
    
    # Print summary
    print_summary
}

# Run main function
main
